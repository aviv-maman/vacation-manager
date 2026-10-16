import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { hash } from "bcryptjs";
import {
  buildCommonEvent,
  getRouteConfig,
  registerHandlerRef,
  setRoutes,
} from "commoneventframework";
import type { APIGatewayProxyStructuredResultV2, Context, RouteConfig } from "commoneventframework";
import jwt from "jsonwebtoken";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabase } from "../database/data-source";
import { User } from "../entities/User";
import type { CommonEvent, HandlerFn } from "../handlers/types";
import { getTestDatabaseUrl } from "../testing/test-database";
import { getJwtSecret, issueToken } from "./jwt";
import { requireUser } from "./require-user";

const testUrl = getTestDatabaseUrl();
const secret = randomBytes(32).toString("hex");
const password = randomBytes(18).toString("base64url");
let passwordHash: string;
let database: DataSource;
let handleRequest: typeof import("../index").handler;
let requester: User;
let validator: User;

function event(method: string, path: string, body?: unknown, token?: string): CommonEvent {
  return {
    method,
    path,
    body: body === undefined ? null : JSON.stringify(body),
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    pathParameters: {},
    queryStringParameters: {},
    version: "commonEvent",
  };
}

async function request(incoming: CommonEvent) {
  return handleRequest(incoming, {} as Context);
}

function body(response: APIGatewayProxyStructuredResultV2): Record<string, unknown> {
  return JSON.parse(response.body ?? "{}");
}

describe("authentication API and role checks", () => {
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", testUrl);
    vi.stubEnv("JWT_SECRET", secret);
    vi.stubEnv("PARAMETER_STORE_ENABLED", "false");
    ({ handler: handleRequest } = await import("../index.js"));
    database = await getDatabase();
    passwordHash = await hash(password, 12);

    // Exercise the real YAML routes and input parser without adding a diagnostic API.
    buildCommonEvent(event("GET", "/health"), resolve("src/root.yaml"));
    const routes = new Set<RouteConfig>();
    for (const [method, path] of [
      ["POST", "/auth/login"],
      ["GET", "/auth/me"],
      ["GET", "/health"],
    ] as const) {
      const route = getRouteConfig(event(method, path));
      if (!route) throw new Error(`Application route is missing: ${method} ${path}`);
      routes.add(route);
    }
    const validatorOnly: HandlerFn = async (_input, incoming) => ({
      user: await requireUser(incoming, ["Validator"]),
    });
    registerHandlerRef("tests#validatorOnly", validatorOnly);
    routes.add({ method: "GET", path: "/test/validator-only", handler: "tests#validatorOnly" });
    setRoutes(routes);
  });

  beforeEach(async () => {
    vi.stubEnv("JWT_SECRET", secret);
    await database.query("TRUNCATE vacation_requests, users RESTART IDENTITY");
    requester = await database.getRepository(User).save({
      name: "Test Requester",
      email: "requester@example.com",
      password: passwordHash,
      role: "Requester",
    });
    validator = await database.getRepository(User).save({
      name: "Test Validator",
      email: "validator@example.com",
      password: passwordHash,
      role: "Validator",
    });
  });

  afterAll(async () => {
    try {
      if (database?.isInitialized) await database.destroy();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("normalizes email, returns only safe fields, and issues a one-hour HS256 token", async () => {
    const response = await request(
      event("POST", "/auth/login", {
        email: "  REQUESTER@EXAMPLE.COM  ",
        password,
        userId: validator.id,
        role: "Validator",
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers?.["Cache-Control"]).toBe("no-store");
    const result = body(response);
    expect(result.user).toEqual({
      id: requester.id,
      name: requester.name,
      email: requester.email,
      role: "Requester",
    });
    expect(Object.keys(result).sort()).toEqual(["token", "user"]);
    expect(typeof result.token).toBe("string");
    const payload = jwt.verify(result.token as string, secret, { algorithms: ["HS256"] });
    if (typeof payload === "string") throw new Error("Expected an object token payload");
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "role", "sub"]);
    expect(payload.sub).toBe(String(requester.id));
    expect(payload.role).toBe("Requester");
    expect(payload.exp! - payload.iat!).toBe(3600);
    expect(JSON.stringify(result)).not.toContain(passwordHash);
  });

  it("allows the seeded role shape for a Validator to log in", async () => {
    const response = await request(
      event("POST", "/auth/login", { email: validator.email, password }),
    );
    expect(response.statusCode).toBe(200);
    expect(body(response).user).toMatchObject({ id: validator.id, role: "Validator" });
  });

  it("returns identical unauthorized responses for unknown emails and wrong passwords", async () => {
    const unknown = await request(
      event("POST", "/auth/login", { email: "missing@example.com", password }),
    );
    const wrong = await request(
      event("POST", "/auth/login", { email: requester.email, password: "wrong-password" }),
    );
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(body(unknown)).toEqual({ error: "Invalid email or password" });
    expect(body(wrong)).toEqual(body(unknown));
  });

  it.each([
    null,
    [],
    {},
    { email: "requester@example.com" },
    { password: "value" },
    { email: 42, password: "value" },
    { email: "requester@example.com", password: {} },
    { email: " ", password: "value" },
    { email: "invalid", password: "value" },
    { email: "requester@example.com", password: "" },
    { email: "requester@example.com", password: "a".repeat(73) },
  ])("rejects invalid login input %# with 400", async (input) => {
    expect((await request(event("POST", "/auth/login", input))).statusCode).toBe(400);
  });

  it("rejects malformed JSON through the CEF input parser", async () => {
    const incoming = event("POST", "/auth/login");
    incoming.body = "{";
    expect((await request(incoming)).statusCode).toBe(400);
  });

  it("does not accept user identity from the body or query without a token", async () => {
    const incoming = event("GET", "/auth/me", { userId: validator.id, role: "Validator" });
    incoming.queryStringParameters = { userId: String(validator.id), role: "Validator" };
    const response = await request(incoming);
    expect(response.statusCode).toBe(401);
    expect(body(response)).toEqual({ error: "Authentication required" });
    expect(response.headers?.["WWW-Authenticate"]).toBe("Bearer");
  });

  it.each(["", "Bearer", "Basic abc", "Bearer not-a-token", "Bearer one two"])(
    "rejects malformed authorization header %s",
    async (authorization) => {
      const incoming = event("GET", "/auth/me");
      incoming.headers = { authorization };
      const response = await request(incoming);
      expect(response.statusCode).toBe(401);
      expect(body(response)).toEqual({ error: "Authentication required" });
    },
  );

  it("rejects expired tokens, wrong signatures, and disallowed algorithms", async () => {
    const tokens = [
      jwt.sign({ role: requester.role }, randomBytes(32), {
        subject: String(requester.id),
        algorithm: "HS256",
        expiresIn: 3600,
      }),
      jwt.sign({ role: requester.role }, secret, {
        subject: String(requester.id),
        algorithm: "HS256",
        expiresIn: -1,
      }),
      jwt.sign({ role: requester.role }, secret, {
        subject: String(requester.id),
        algorithm: "HS384",
        expiresIn: 3600,
      }),
    ];
    for (const token of tokens) {
      const response = await request(event("GET", "/auth/me", undefined, token));
      expect(response.statusCode).toBe(401);
      expect(body(response)).toEqual({ error: "Authentication required" });
    }
  });

  it("rejects tokens without an expiration or with an invalid subject", async () => {
    for (const token of [
      jwt.sign({ role: requester.role }, secret, {
        subject: String(requester.id),
        algorithm: "HS256",
      }),
      jwt.sign({ role: requester.role }, secret, {
        subject: "1.5",
        algorithm: "HS256",
        expiresIn: 3600,
      }),
      jwt.sign({ role: requester.role }, secret, {
        subject: "2147483648",
        algorithm: "HS256",
        expiresIn: 3600,
      }),
    ]) {
      expect((await request(event("GET", "/auth/me", undefined, token))).statusCode).toBe(401);
    }
  });

  it("returns the current safe profile and accepts case-insensitive header names", async () => {
    const incoming = event("GET", "/auth/me");
    incoming.headers = { Authorization: `Bearer ${issueToken(requester)}` };
    const response = await request(incoming);
    expect(response.statusCode).toBe(200);
    expect(response.headers?.["Cache-Control"]).toBe("no-store");
    expect(body(response)).toEqual({
      user: { id: requester.id, name: requester.name, email: requester.email, role: "Requester" },
    });
  });

  it("uses the database role for 403/200 checks, ignoring a forged role claim", async () => {
    const forgedRole = jwt.sign({ role: "Validator" }, secret, {
      subject: String(requester.id),
      algorithm: "HS256",
      expiresIn: 3600,
    });
    const denied = await request(event("GET", "/test/validator-only", undefined, forgedRole));
    expect(denied.statusCode).toBe(403);
    expect(body(denied)).toEqual({ error: "Forbidden" });
    const allowed = await request(
      event("GET", "/test/validator-only", undefined, issueToken(validator)),
    );
    expect(allowed.statusCode).toBe(200);
    expect(body(allowed).user).toMatchObject({ id: validator.id, role: "Validator" });
  });

  it("reloads role changes and deleted users for an existing token", async () => {
    const token = issueToken(requester);
    await database.getRepository(User).update(requester.id, { role: "Validator" });
    expect((await request(event("GET", "/test/validator-only", undefined, token))).statusCode).toBe(
      200,
    );
    await database.getRepository(User).delete(requester.id);
    const deleted = await request(event("GET", "/auth/me", undefined, token));
    expect(deleted.statusCode).toBe(401);
    expect(body(deleted)).toEqual({ error: "Authentication required" });
  });

  it.each([undefined, "replace-me", " ".repeat(64)])(
    "fails safely with invalid JWT configuration %#",
    async (value) => {
      const token = issueToken(requester);
      vi.stubEnv("JWT_SECRET", value);
      expect(() => getJwtSecret()).toThrow("JWT_SECRET");
      const response = await request(event("GET", "/auth/me", undefined, token));
      expect(response.statusCode).toBe(500);
      expect(body(response)).toEqual({ error: "An unexpected error occurred" });
    },
  );
});
