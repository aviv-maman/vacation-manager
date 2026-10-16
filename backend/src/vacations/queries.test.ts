import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { hash } from "bcryptjs";
import { buildCommonEvent } from "commoneventframework";
import type { APIGatewayProxyStructuredResultV2, Context } from "commoneventframework";
import type { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { issueToken } from "../auth/jwt";
import { getDatabase } from "../database/data-source";
import { User } from "../entities/User";
import { VacationRequest } from "../entities/VacationRequest";
import type { VacationStatus } from "../entities/VacationRequest";
import type { CommonEvent } from "../handlers/types";
import { getTestDatabaseUrl } from "../testing/test-database";

const testUrl = getTestDatabaseUrl();
const statuses: VacationStatus[] = ["Pending", "Approved", "Rejected"];
let database: DataSource;
let handleRequest: typeof import("../index").handler;
let alice: User;
let bob: User;
let maya: User;
let requests: VacationRequest[];
let passwordHash: string;

function incoming(url: string, actor: User | null): CommonEvent {
  const parsed = new URL(url, "http://localhost");

  return {
    method: "GET",
    path: parsed.pathname,
    body: null,
    headers: actor ? { authorization: `Bearer ${issueToken(actor)}` } : {},
    pathParameters: {},
    queryStringParameters: Object.fromEntries(parsed.searchParams),
    version: "commonEvent",
  };
}

function api(url: string, actor: User | null = maya): Promise<APIGatewayProxyStructuredResultV2> {
  return handleRequest(incoming(url, actor), {} as Context);
}

function body(response: APIGatewayProxyStructuredResultV2): Record<string, unknown> {
  return JSON.parse(response.body ?? "{}");
}

function items(response: APIGatewayProxyStructuredResultV2): Record<string, unknown>[] {
  return body(response).items as Record<string, unknown>[];
}

function dateAfter(days: number): string {
  const result = new Date("2050-01-01T00:00:00Z");

  result.setUTCDate(result.getUTCDate() + days);

  return result.toISOString().slice(0, 10);
}

describe("request listings and team planning through CEF routes", () => {
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", testUrl);
    vi.stubEnv("JWT_SECRET", randomBytes(32).toString("hex"));
    vi.stubEnv("PARAMETER_STORE_ENABLED", "false");
    ({ handler: handleRequest } = await import("../index.js"));
    database = await getDatabase();
    passwordHash = await hash(randomBytes(18).toString("base64url"), 12);
    buildCommonEvent(incoming("/health", null), resolve("src/root.yaml"));
  });

  beforeEach(async () => {
    await database.query("TRUNCATE vacation_requests, users RESTART IDENTITY");

    const users = database.getRepository(User);

    alice = await users.save({
      name: "Alice Requester",
      email: "alice@example.com",
      password: passwordHash,
      role: "Requester",
    });
    bob = await users.save({
      name: "Bob Requester",
      email: "bob@example.com",
      password: passwordHash,
      role: "Requester",
    });
    maya = await users.save({
      name: "Maya Validator",
      email: "maya@example.com",
      password: passwordHash,
      role: "Validator",
    });

    const repository = database.getRepository(VacationRequest);
    const rows: VacationRequest[] = [];

    for (const [offset, user] of [alice, bob].entries()) {
      for (let index = 0; index < 8; index++) {
        const status = statuses[index % statuses.length]!;

        rows.push(
          repository.create({
            userId: user.id,
            startDate: dateAfter(index * 4 + offset),
            endDate: dateAfter(index * 4 + offset + 2),
            status,
            reason: `Private reason for ${user.name}`,
            comments: status === "Rejected" ? `Private rejection for ${user.name}` : null,
            createdAt: new Date("2040-01-01T00:00:00Z"),
          }),
        );
      }
    }
    requests = await repository.save(rows);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      if (database?.isInitialized) await database.destroy();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    "/vacation-requests/mine",
    "/vacation-requests",
    "/users?role=Requester",
    "/team-vacations?from=2050-01-01&to=2050-02-01",
  ])("requires authentication on %s", async (url) => {
    const response = await api(url, null);

    expect(response.statusCode).toBe(401);
    expect(body(response)).toEqual({ error: "Authentication required" });
  });

  it("lists only the token owner's requests and ignores a forged userId query", async () => {
    for (const [user, other] of [
      [alice, bob],
      [bob, alice],
    ] as const) {
      const expected = requests
        .filter((request) => request.userId === user.id)
        .map((request) => request.id)
        .reverse();

      for (const userId of [String(other.id), "not-a-user"]) {
        const response = await api(`/vacation-requests/mine?userId=${userId}`, user);

        expect(response.statusCode).toBe(200);
        expect(body(response)).toMatchObject({ page: 1, pageSize: 10, total: 8 });
        expect(items(response).map((request) => request.id)).toEqual(expected);
        expect(items(response).every((request) => request.userId === user.id)).toBe(true);
        expect(new Set(items(response).map((request) => request.status))).toEqual(
          new Set(statuses),
        );
        expect(items(response).find((request) => request.status === "Rejected")).toMatchObject({
          reason: `Private reason for ${user.name}`,
          comments: `Private rejection for ${user.name}`,
        });
        expect(items(response)[0]?.user).toEqual({ id: user.id, name: user.name });
        expect(response.headers?.["Cache-Control"]).toBe("no-store");
      }
    }
  });

  it("paginates each owner's requests without leaking another user's rows or total", async () => {
    const repository = database.getRepository(VacationRequest);

    for (const user of [alice, bob]) {
      const added = await repository.save(
        Array.from({ length: 6 }, (_, index) =>
          repository.create({
            userId: user.id,
            startDate: dateAfter(40 + index * 4),
            endDate: dateAfter(42 + index * 4),
            status: "Rejected",
            comments: "Extra pagination fixture",
            reason: "Private pagination reason",
            createdAt: new Date("2040-01-01T00:00:00Z"),
          }),
        ),
      );

      requests.push(...added);
    }
    expect(await repository.count()).toBe(28);
    for (const [user, other] of [
      [alice, bob],
      [bob, alice],
    ] as const) {
      const seen: unknown[] = [];
      const expected = requests
        .filter((request) => request.userId === user.id)
        .map((request) => request.id)
        .sort((a, b) => b - a);

      for (const page of [1, 2, 3]) {
        const response = await api(`/vacation-requests/mine?page=${page}&userId=${other.id}`, user);

        expect(response.statusCode).toBe(200);
        expect(body(response)).toMatchObject({ page, pageSize: 10, total: 14 });
        expect(items(response)).toHaveLength(page === 1 ? 10 : page === 2 ? 4 : 0);
        expect(items(response).every((request) => request.userId === user.id)).toBe(true);
        seen.push(...items(response).map((request) => request.id));
      }
      expect(seen).toEqual(expected);
      expect(new Set(seen).size).toBe(14);
    }
  });

  it("returns an empty own list without exposing another user's requests", async () => {
    await database.getRepository(VacationRequest).delete({ userId: alice.id });

    const response = await api("/vacation-requests/mine", alice);

    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({ items: [], page: 1, pageSize: 10, total: 0 });
    expect(await database.getRepository(VacationRequest).count()).toBe(8);
  });

  it("rejects a Validator on the Requester-only listing", async () => {
    expect((await api("/vacation-requests/mine", maya)).statusCode).toBe(403);
  });

  it.each(["/vacation-requests", "/users?role=Requester"])(
    "rejects a Requester on %s",
    async (url) => {
      expect((await api(url, alice)).statusCode).toBe(403);
    },
  );

  it("paginates in a stable order for identical timestamps with no duplicate or missing IDs", async () => {
    const first = await api("/vacation-requests");
    const second = await api("/vacation-requests?page=2");

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(body(first)).toMatchObject({ page: 1, pageSize: 10, total: 16 });
    expect(body(second)).toMatchObject({ page: 2, pageSize: 10, total: 16 });
    expect(items(first)).toHaveLength(10);
    expect(items(second)).toHaveLength(6);

    const ids = [...items(first), ...items(second)].map((request) => request.id);

    expect(ids).toEqual(requests.map((request) => request.id).reverse());
    expect(new Set(ids).size).toBe(16);
    expect(items(await api("/vacation-requests?page=1")).map((request) => request.id)).toEqual(
      ids.slice(0, 10),
    );
    expect(Object.keys(body(first)).sort()).toEqual(["items", "page", "pageSize", "total"]);
  });

  it("sorts by creation timestamp before using the ID tie-breaker", async () => {
    await database
      .getRepository(VacationRequest)
      .update(requests[0]!.id, { createdAt: new Date("2041-01-01T00:00:00Z") });

    const response = await api("/vacation-requests");

    expect(items(response).map((request) => request.id)).toEqual([
      requests[0]!.id,
      ...requests
        .slice(7)
        .map((request) => request.id)
        .reverse(),
    ]);
  });

  it("uses SQL pagination and a bounded number of queries, with only safe employee fields", async () => {
    const queries = vi.spyOn(database.logger, "logQuery");
    const response = await api("/vacation-requests?page=2");

    expect(response.statusCode).toBe(200);

    const selects = queries.mock.calls
      .map((call) => call[0])
      .filter((query) => /^SELECT\b/i.test(query));

    expect(selects.length).toBeLessThanOrEqual(4);
    expect(selects.some((query) => /\bLIMIT\b/.test(query) && /\bOFFSET\b/.test(query))).toBe(true);
    expect(selects.some((query) => /JOIN "users"/.test(query))).toBe(true);
    for (const request of items(response)) {
      const user = request.user as Record<string, unknown>;

      expect(Object.keys(user).sort()).toEqual(["id", "name"]);
      expect(user).toEqual(
        request.userId === alice.id
          ? { id: alice.id, name: alice.name }
          : { id: bob.id, name: bob.name },
      );
      expect(typeof request.startDate).toBe("string");
      expect(typeof request.endDate).toBe("string");
    }
    expect(JSON.stringify(body(response))).not.toContain("@example.com");
    expect(JSON.stringify(body(response))).not.toContain(passwordHash);
  });

  it.each([
    ["Pending", 6],
    ["Approved", 6],
    ["Rejected", 4],
  ] as const)("filters by %s with total %i", async (status, total) => {
    const response = await api(`/vacation-requests?status=${status}`);

    expect(response.statusCode).toBe(200);
    expect(body(response)).toMatchObject({ page: 1, pageSize: 10, total });
    expect(items(response)).toHaveLength(total);
    expect(items(response).every((request) => request.status === status)).toBe(true);
  });

  it("filters by user with a total counted after filtering", async () => {
    const response = await api(`/vacation-requests?userId=${alice.id}`);

    expect(body(response)).toMatchObject({ total: 8 });
    expect(items(response).map((request) => request.id)).toEqual(
      requests
        .filter((request) => request.userId === alice.id)
        .map((request) => request.id)
        .reverse(),
    );
  });

  it.each([
    ["Pending", 3],
    ["Approved", 3],
    ["Rejected", 2],
  ] as const)("combines the user filter with %s", async (status, total) => {
    for (const user of [alice, bob]) {
      const response = await api(`/vacation-requests?userId=${user.id}&status=${status}`);

      expect(response.statusCode).toBe(200);
      expect(body(response)).toMatchObject({ total });
      expect(items(response)).toHaveLength(total);
      expect(
        items(response).every((request) => request.userId === user.id && request.status === status),
      ).toBe(true);

      const next = await api(`/vacation-requests?userId=${user.id}&status=${status}&page=2`);

      expect(body(next)).toEqual({ items: [], page: 2, pageSize: 10, total });
    }
  });

  it("returns empty pages for out-of-range pages or a valid nonexistent user", async () => {
    expect(body(await api("/vacation-requests?page=3"))).toEqual({
      items: [],
      page: 3,
      pageSize: 10,
      total: 16,
    });
    expect(body(await api("/vacation-requests?page=2147483647"))).toEqual({
      items: [],
      page: 2147483647,
      pageSize: 10,
      total: 16,
    });
    expect(body(await api("/vacation-requests?userId=2147483647"))).toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
    });
  });

  it.each(["", "Other", "pending", " Approved ", "Pending' OR 1=1"])(
    "rejects invalid status %s",
    async (status) => {
      expect((await api(`/vacation-requests?${new URLSearchParams({ status })}`)).statusCode).toBe(
        400,
      );
    },
  );

  it.each([
    "",
    "0",
    "-1",
    "01",
    "1.5",
    "1e2",
    "abc",
    "Infinity",
    "2147483648",
    "9007199254740992",
    " 1",
    "1 OR 1=1",
  ])("rejects invalid page and userId values: %s", async (value) => {
    for (const field of ["page", "userId"]) {
      expect(
        (await api(`/vacation-requests?${new URLSearchParams({ [field]: value })}`)).statusCode,
      ).toBe(400);
    }

    const mine = await api(
      `/vacation-requests/mine?${new URLSearchParams({ page: value })}`,
      alice,
    );

    expect(mine.statusCode).toBe(400);
    expect(body(mine)).toEqual(
      body(await api(`/vacation-requests?${new URLSearchParams({ page: value })}`)),
    );
  });

  it("lists Requesters for the filter dropdown with only IDs and names", async () => {
    const response = await api("/users?role=Requester");

    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({
      items: [
        { id: alice.id, name: alice.name },
        { id: bob.id, name: bob.name },
      ],
    });
    expect(body(await api("/users"))).toEqual(body(response));
    for (const user of items(response)) expect(Object.keys(user).sort()).toEqual(["id", "name"]);
  });

  it.each(["", "Validator", "Other"])("rejects unsupported dropdown role %s", async (role) => {
    expect((await api(`/users?${new URLSearchParams({ role })}`)).statusCode).toBe(400);
  });

  it("returns an empty dropdown when there are no Requesters", async () => {
    await database.getRepository(VacationRequest).clear();
    await database.getRepository(User).delete({ role: "Requester" });
    expect(body(await api("/users?role=Requester"))).toEqual({ items: [] });
  });

  it("allows both roles to see all Approved vacations with exactly the public keys", async () => {
    for (const user of [alice, bob, maya]) {
      const response = await api("/team-vacations?from=2050-01-01&to=2050-02-01", user);

      expect(response.statusCode).toBe(200);
      expect(Object.keys(body(response))).toEqual(["items"]);
      expect(items(response)).toHaveLength(6);
      for (const request of items(response)) {
        expect(Object.keys(request).sort()).toEqual(["endDate", "name", "startDate"]);
        expect(typeof request.startDate).toBe("string");
        expect(typeof request.endDate).toBe("string");
        expect(request.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(request.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      expect(JSON.stringify(body(response))).not.toContain("Private");
      expect(JSON.stringify(body(response))).not.toContain("@example.com");
      expect(JSON.stringify(body(response))).not.toContain(passwordHash);
    }
  });

  it.each([
    ["2050-01-04", "2050-01-05", ["Alice Requester"]],
    ["2050-01-06", "2050-01-06", ["Alice Requester", "Bob Requester"]],
    ["2050-01-07", "2050-01-07", ["Alice Requester", "Bob Requester"]],
    ["2050-01-08", "2050-01-08", ["Bob Requester"]],
    ["2050-01-09", "2050-01-12", []],
    ["2050-01-01", "2050-01-03", []],
  ] as const)("filters inclusive overlaps from %s through %s", async (from, to, names) => {
    const response = await api(`/team-vacations?from=${from}&to=${to}`, alice);

    expect(response.statusCode).toBe(200);
    expect(items(response).map((request) => request.name)).toEqual(names);
    for (const request of items(response)) {
      expect(request).toEqual(
        request.name === alice.name
          ? { name: alice.name, startDate: "2050-01-05", endDate: "2050-01-07" }
          : { name: bob.name, startDate: "2050-01-06", endDate: "2050-01-08" },
      );
    }
  });

  it("allows past team ranges and maps dates as strings without selecting private columns", async () => {
    await database.getRepository(VacationRequest).save({
      userId: alice.id,
      startDate: "2000-01-01",
      endDate: "2000-01-03",
      status: "Approved",
      reason: "Private past reason",
    });

    const queries = vi.spyOn(database.logger, "logQuery");
    const response = await api("/team-vacations?from=2000-01-02&to=2000-01-02", alice);

    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({
      items: [{ name: alice.name, startDate: "2000-01-01", endDate: "2000-01-03" }],
    });

    const reads = queries.mock.calls
      .map((call) => call[0])
      .filter((query) => query.includes('FROM "vacation_requests"'));

    expect(reads).toHaveLength(1);
    expect(reads[0]).not.toMatch(/reason|comments|email|password/);
  });

  it.each([
    ["2050-01-01", "2051-01-02", 200],
    ["2050-01-01", "2051-01-03", 400],
    ["2024-01-01", "2025-01-01", 200],
    ["2024-01-01", "2025-01-02", 400],
  ] as const)("bounds team range from %s through %s with status %i", async (from, to, status) => {
    const response = await api(`/team-vacations?from=${from}&to=${to}`, alice);

    expect(response.statusCode).toBe(status);
    if (status === 400) {
      expect(body(response)).toEqual({ error: "Team date range must not exceed 366 days" });
    } else {
      expect(items(response)).toHaveLength(from.startsWith("2050") ? 6 : 0);
    }
  });

  it.each([
    "",
    "?from=2050-01-01",
    "?to=2050-01-02",
    "?from=&to=2050-01-02",
    "?from=2050-01-01&to=",
    "?from=2050-02-30&to=2050-03-02",
    "?from=2050-02-01&to=2050-02-30",
    "?from=2050-01-02&to=2050-01-01",
    "?from=2050-1-01&to=2050-01-02",
    "?from=2050-01-01T00:00:00Z&to=2050-01-02",
    "?from=0000-01-01&to=2050-01-02",
  ])("rejects missing or invalid team dates %s", async (query) => {
    expect((await api(`/team-vacations${query}`, alice)).statusCode).toBe(400);
  });
});
