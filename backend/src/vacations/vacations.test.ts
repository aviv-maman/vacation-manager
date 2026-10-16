import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { hash } from "bcryptjs";
import { buildCommonEvent } from "commoneventframework";
import type { APIGatewayProxyStructuredResultV2, Context } from "commoneventframework";
import type { DataSource } from "typeorm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { issueToken } from "../auth/jwt";
import { createDatabase, getDatabase } from "../database/data-source";
import { User } from "../entities/User";
import { VacationRequest } from "../entities/VacationRequest";
import type { VacationStatus } from "../entities/VacationRequest";
import type { CommonEvent } from "../handlers/types";
import { getTestDatabaseUrl } from "../testing/test-database";
import {
  ApproveVacationRequestCommand,
  CreateVacationRequestCommand,
  RejectVacationRequestCommand,
} from "./commands";
import { todayInJerusalem } from "./dates";
import { businessEvents, BusinessEventPublisher } from "./events";

const testUrl = getTestDatabaseUrl();
let database: DataSource;
let handleRequest: typeof import("../index").handler;
let requester: User;
let otherRequester: User;
let validator: User;
let passwordHash: string;

function event(path: string, data?: unknown, actor: User | null = requester): CommonEvent {
  return {
    method: "POST",
    path,
    body: data === undefined ? null : JSON.stringify(data),
    headers: actor ? { authorization: `Bearer ${issueToken(actor)}` } : {},
    pathParameters: {},
    queryStringParameters: {},
    version: "commonEvent",
  };
}

function api(
  path: string,
  data?: unknown,
  actor: User | null = requester,
): Promise<APIGatewayProxyStructuredResultV2> {
  return handleRequest(event(path, data, actor), {} as Context);
}

function body(response: APIGatewayProxyStructuredResultV2): Record<string, unknown> {
  return JSON.parse(response.body ?? "{}");
}

function fixture(status: VacationStatus = "Pending", userId = requester.id) {
  return database.getRepository(VacationRequest).save({
    userId,
    startDate: "2050-01-10",
    endDate: "2050-01-12",
    status,
    comments: status === "Rejected" ? "Original rejection" : null,
    reason: "Private reason",
  });
}

async function waitForDatabaseLocks(count: number): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const [row] = await database.query<{ count: number }[]>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query ILIKE '%vacation_requests%'",
    );
    if (row && row.count >= count) return;
    await setTimeout(20);
  }
  throw new Error(`Expected ${count} database operation(s) waiting on a lock`);
}

describe("vacation commands through CEF routes", () => {
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", testUrl);
    vi.stubEnv("JWT_SECRET", randomBytes(32).toString("hex"));
    vi.stubEnv("PARAMETER_STORE_ENABLED", "false");
    ({ handler: handleRequest } = await import("../index.js"));
    database = await getDatabase();
    passwordHash = await hash(randomBytes(18).toString("base64url"), 12);
    buildCommonEvent(event("/vacation-requests", undefined, null), resolve("src/root.yaml"));
  });

  beforeEach(async () => {
    await database.query("TRUNCATE vacation_requests, users RESTART IDENTITY");
    const repository = database.getRepository(User);
    requester = await repository.save({
      name: "First Requester",
      email: "first@example.com",
      password: passwordHash,
      role: "Requester",
    });
    otherRequester = await repository.save({
      name: "Other Requester",
      email: "other@example.com",
      password: passwordHash,
      role: "Requester",
    });
    validator = await repository.save({
      name: "Validator",
      email: "validator@example.com",
      password: passwordHash,
      role: "Validator",
    });
    vi.spyOn(businessEvents, "publish");
    vi.spyOn(console, "info").mockImplementation(() => {});
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

  it("creates a Pending request owned by the token user, ignoring forged identity and status", async () => {
    const response = await api("/vacation-requests", {
      startDate: "2050-01-10",
      endDate: "2050-01-12",
      reason: "  Private reason  ",
      userId: otherRequester.id,
      role: "Validator",
      status: "Approved",
      comments: "Forged",
    });
    expect(response.statusCode).toBe(201);
    expect(body(response).request).toEqual({
      id: expect.any(Number),
      userId: requester.id,
      startDate: "2050-01-10",
      endDate: "2050-01-12",
      reason: "Private reason",
      status: "Pending",
      comments: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(businessEvents.publish).toHaveBeenCalledExactlyOnceWith({
      type: "VacationRequestCreatedEvent",
      requestId: expect.any(Number),
      userId: requester.id,
      actorId: requester.id,
      occurredAt: expect.any(String),
    });
    const log = JSON.parse(vi.mocked(console.info).mock.calls[0]![0] as string);
    expect(Object.keys(log).sort()).toEqual([
      "actorId",
      "occurredAt",
      "requestId",
      "type",
      "userId",
    ]);
    expect(JSON.stringify(log)).not.toContain("Private reason");
  });

  it("accepts a 500-character reason and rejects 501 before writing or publishing", async () => {
    const input = { startDate: "2050-01-10", endDate: "2050-01-12" };
    const invalid = await api("/vacation-requests", { ...input, reason: "r".repeat(501) });
    expect(invalid.statusCode).toBe(400);
    expect(body(invalid)).toEqual({ error: "Reason must not exceed 500 characters" });
    expect(await database.getRepository(VacationRequest).count()).toBe(0);
    expect(businessEvents.publish).not.toHaveBeenCalled();

    const valid = await api("/vacation-requests", { ...input, reason: "r".repeat(500) });
    expect(valid.statusCode).toBe(201);
    expect(body(valid).request).toMatchObject({ reason: "r".repeat(500) });
    expect(businessEvents.publish).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, " \n\t "])(
    "allows starting today and an omitted or blank reason %#",
    async (reason) => {
      const today = todayInJerusalem();
      const end = new Date(`${today}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      const response = await api("/vacation-requests", {
        startDate: today,
        endDate: end.toISOString().slice(0, 10),
        reason,
      });
      expect(response.statusCode).toBe(201);
      expect(body(response).request).toMatchObject({ startDate: today, reason: null });
    },
  );

  it.each([
    null,
    [],
    {},
    { startDate: "2050-01-10" },
    { startDate: 42, endDate: "2050-01-12" },
    { startDate: "2050-01-10", endDate: false },
    { startDate: "2050-01-10", endDate: "2050-01-12", reason: {} },
    { startDate: "2050-02-30", endDate: "2050-03-03" },
    { startDate: "2050-01-10T00:00:00Z", endDate: "2050-01-12" },
    { startDate: "2050-01-10", endDate: "2050-01-10" },
    { startDate: "2050-01-12", endDate: "2050-01-10" },
    { startDate: "2000-01-10", endDate: "2000-01-12" },
  ])("rejects invalid create input %# without writing or publishing", async (input) => {
    expect((await api("/vacation-requests", input)).statusCode).toBe(400);
    expect(await database.getRepository(VacationRequest).count()).toBe(0);
    expect(businessEvents.publish).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON through the create input parser", async () => {
    const incoming = event("/vacation-requests");
    incoming.body = "{";
    expect((await handleRequest(incoming, {} as Context)).statusCode).toBe(400);
    expect(businessEvents.publish).not.toHaveBeenCalled();
  });

  it.each([
    ["/vacation-requests", { startDate: "2050-01-10", endDate: "2050-01-12" }],
    ["/vacation-requests/1/approve", undefined],
    ["/vacation-requests/1/reject", { comments: "Coverage" }],
  ])("requires authentication on %s", async (path, input) => {
    expect((await api(path, input, null)).statusCode).toBe(401);
    expect(businessEvents.publish).not.toHaveBeenCalled();
  });

  it("does not let Validators submit requests", async () => {
    expect(
      (
        await api(
          "/vacation-requests",
          { startDate: "2050-01-10", endDate: "2050-01-12" },
          validator,
        )
      ).statusCode,
    ).toBe(403);
    expect(await database.getRepository(VacationRequest).count()).toBe(0);
    expect(businessEvents.publish).not.toHaveBeenCalled();
  });

  it.each(["approve", "reject"])(
    "does not let Requesters %s their own or another user's request",
    async (action) => {
      const own = await fixture();
      const other = await fixture("Pending", otherRequester.id);
      for (const request of [own, other]) {
        expect(
          (await api(`/vacation-requests/${request.id}/${action}`, { comments: "Coverage" }))
            .statusCode,
        ).toBe(403);
        expect(
          (await database.getRepository(VacationRequest).findOneByOrFail({ id: request.id }))
            .status,
        ).toBe("Pending");
      }
      expect(businessEvents.publish).not.toHaveBeenCalled();
    },
  );

  it.each(["Pending", "Approved"] as const)(
    "blocks inclusive overlap with %s requests",
    async (status) => {
      await fixture(status);
      const response = await api("/vacation-requests", {
        startDate: "2050-01-12",
        endDate: "2050-01-14",
      });
      expect(response.statusCode).toBe(409);
      expect(body(response)).toEqual({
        error: "Vacation dates overlap an existing Pending or Approved request",
      });
      expect(await database.getRepository(VacationRequest).count()).toBe(1);
      expect(businessEvents.publish).not.toHaveBeenCalled();
    },
  );

  it("permits Rejected overlaps, different users, and a range starting after the inclusive end", async () => {
    await fixture("Rejected");
    await fixture("Approved", otherRequester.id);
    expect(
      (await api("/vacation-requests", { startDate: "2050-01-10", endDate: "2050-01-12" }))
        .statusCode,
    ).toBe(201);
    expect(
      (await api("/vacation-requests", { startDate: "2050-01-13", endDate: "2050-01-15" }))
        .statusCode,
    ).toBe(201);
    expect(await database.getRepository(VacationRequest).count()).toBe(4);
  });

  it.each(["approve", "reject"])(
    "allows a Validator to %s a Pending request whose dates are in the past",
    async (action) => {
      const request = await fixture();
      const old = new Date("2000-01-01T00:00:00Z");
      await database
        .getRepository(VacationRequest)
        .update(request.id, { startDate: "2000-01-10", endDate: "2000-01-12", updatedAt: old });
      const response = await api(
        `/vacation-requests/${request.id}/${action}`,
        { comments: "  Coverage needed  " },
        validator,
      );
      expect(response.statusCode).toBe(200);
      const saved = await database
        .getRepository(VacationRequest)
        .findOneByOrFail({ id: request.id });
      expect(saved.status).toBe(action === "approve" ? "Approved" : "Rejected");
      expect(saved.comments).toBe(action === "approve" ? null : "Coverage needed");
      expect(saved.updatedAt.getTime()).toBeGreaterThan(old.getTime());
      expect(body(response).request).toMatchObject({
        userId: requester.id,
        startDate: "2000-01-10",
        endDate: "2000-01-12",
        status: saved.status,
        comments: saved.comments,
      });
      expect(businessEvents.publish).toHaveBeenCalledExactlyOnceWith({
        type:
          action === "approve" ? "VacationRequestApprovedEvent" : "VacationRequestRejectedEvent",
        requestId: saved.id,
        userId: requester.id,
        actorId: validator.id,
        occurredAt: expect.any(String),
      });
    },
  );

  it("accepts a 500-character rejection comment and rejects 501 without changing the request", async () => {
    const request = await fixture();
    const path = `/vacation-requests/${request.id}/reject`;
    const invalid = await api(path, { comments: "c".repeat(501) }, validator);
    expect(invalid.statusCode).toBe(400);
    expect(body(invalid)).toEqual({ error: "Rejection comment must not exceed 500 characters" });
    expect(
      await database.getRepository(VacationRequest).findOneByOrFail({ id: request.id }),
    ).toEqual(request);
    expect(businessEvents.publish).not.toHaveBeenCalled();

    const valid = await api(path, { comments: "c".repeat(500) }, validator);
    expect(valid.statusCode).toBe(200);
    expect(body(valid).request).toMatchObject({ status: "Rejected", comments: "c".repeat(500) });
    expect(businessEvents.publish).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, [], {}, { comments: 42 }, { comments: "" }, { comments: " \n\t " }])(
    "requires a nonblank rejection comment %#",
    async (input) => {
      const request = await fixture();
      expect(
        (await api(`/vacation-requests/${request.id}/reject`, input, validator)).statusCode,
      ).toBe(400);
      expect(
        (await database.getRepository(VacationRequest).findOneByOrFail({ id: request.id })).status,
      ).toBe("Pending");
      expect(businessEvents.publish).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["Approved", "approve"],
    ["Approved", "reject"],
    ["Rejected", "approve"],
    ["Rejected", "reject"],
  ] as const)("does not change a final %s request through %s", async (status, action) => {
    const request = await fixture(status);
    const response = await api(
      `/vacation-requests/${request.id}/${action}`,
      { comments: "Replacement" },
      validator,
    );
    expect(response.statusCode).toBe(409);
    expect(
      await database.getRepository(VacationRequest).findOneByOrFail({ id: request.id }),
    ).toEqual(request);
    expect(businessEvents.publish).not.toHaveBeenCalled();
  });

  it.each(["approve", "reject"])(
    "returns 404 when the request to %s does not exist",
    async (action) => {
      expect(
        (await api(`/vacation-requests/999/${action}`, { comments: "Coverage" }, validator))
          .statusCode,
      ).toBe(404);
      expect(businessEvents.publish).not.toHaveBeenCalled();
    },
  );

  it.each(["0", "-1", "01", "1.1", "abc", "2147483648", "1e2"])(
    "rejects invalid request ID %s",
    async (id) => {
      expect((await api(`/vacation-requests/${id}/approve`, undefined, validator)).statusCode).toBe(
        400,
      );
      expect(businessEvents.publish).not.toHaveBeenCalled();
    },
  );

  it("maps the exclusion constraint's 23P01 to 409 after an overlapping transaction commits", async () => {
    const first = database.createQueryRunner();
    let competing: ReturnType<typeof api> | undefined;
    try {
      await first.startTransaction();
      await first.manager
        .getRepository(VacationRequest)
        .save({ userId: requester.id, startDate: "2050-01-10", endDate: "2050-01-12" });
      competing = api("/vacation-requests", { startDate: "2050-01-12", endDate: "2050-01-14" });
      await waitForDatabaseLocks(1);
      expect(businessEvents.publish).not.toHaveBeenCalled();
      await first.commitTransaction();
      const response = await competing;
      expect(response.statusCode).toBe(409);
      expect(body(response)).toEqual({
        error: "Vacation dates overlap an existing Pending or Approved request",
      });
      expect(await database.getRepository(VacationRequest).count()).toBe(1);
      expect(businessEvents.publish).not.toHaveBeenCalled();
    } finally {
      if (first.isTransactionActive) await first.rollbackTransaction();
      await first.release();
      await competing;
    }
  });

  it("allows exactly one competing approve/reject decision and publishes exactly one event", async () => {
    const request = await fixture();
    const lock = database.createQueryRunner();
    let decisions: ReturnType<typeof api>[] = [];
    try {
      await lock.startTransaction();
      await lock.manager
        .getRepository(VacationRequest)
        .findOne({ where: { id: request.id }, lock: { mode: "pessimistic_write" } });
      decisions = [
        api(`/vacation-requests/${request.id}/approve`, undefined, validator),
        api(`/vacation-requests/${request.id}/reject`, { comments: "Coverage" }, validator),
      ];
      await waitForDatabaseLocks(2);
      expect(businessEvents.publish).not.toHaveBeenCalled();
      await lock.commitTransaction();
      const responses: APIGatewayProxyStructuredResultV2[] = await Promise.all(decisions);
      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
      expect(businessEvents.publish).toHaveBeenCalledTimes(1);
      const saved = await database
        .getRepository(VacationRequest)
        .findOneByOrFail({ id: request.id });
      expect(
        body(responses.find((response) => response.statusCode === 200)!).request,
      ).toMatchObject({ status: saved.status, comments: saved.comments });
    } finally {
      if (lock.isTransactionActive) await lock.rollbackTransaction();
      await lock.release();
      await Promise.all(decisions);
    }
  });

  it("publishes only after commit, and continues to other listeners after a failure", async () => {
    const reader = await createDatabase(testUrl).initialize();
    const observations: boolean[] = [];
    const laterListener = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const events = new BusinessEventPublisher([
        async (event) => {
          observations.push(
            await reader.getRepository(VacationRequest).existsBy({ id: event.requestId }),
          );
        },
        async () => {
          throw new Error("Listener failed");
        },
        laterListener,
      ]);
      const saved = await new CreateVacationRequestCommand(database, events).execute(requester, {
        startDate: "2050-01-10",
        endDate: "2050-01-12",
      });
      expect(observations).toEqual([true]);
      expect(laterListener).toHaveBeenCalledTimes(1);
      expect(
        await reader.getRepository(VacationRequest).findOneByOrFail({ id: saved.id }),
      ).toMatchObject({ status: "Pending" });
    } finally {
      await reader.destroy();
    }
  });

  it("keeps the HTTP success and committed data when both logging sinks throw", async () => {
    vi.mocked(console.info).mockImplementation(() => {
      throw new Error("Logging unavailable");
    });
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("Fallback unavailable");
    });
    const response = await api("/vacation-requests", {
      startDate: "2050-01-10",
      endDate: "2050-01-12",
    });
    expect(response.statusCode).toBe(201);
    expect(await database.getRepository(VacationRequest).count()).toBe(1);
  });

  it("enforces roles in commands as well as HTTP handlers", async () => {
    const input = { startDate: "2050-01-10", endDate: "2050-01-12" };
    await expect(
      new CreateVacationRequestCommand(database).execute(validator, input),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      new ApproveVacationRequestCommand(database).execute(requester, 1),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      new RejectVacationRequestCommand(database).execute(requester, 1, "Coverage"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(businessEvents.publish).not.toHaveBeenCalled();
  });
});
