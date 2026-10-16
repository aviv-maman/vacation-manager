import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { compare, hash } from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "./data-source";
import { seedDemoData } from "./seed-demo-data";
import { User } from "../entities/User";
import { VacationRequest } from "../entities/VacationRequest";
import { getTestDatabaseUrl } from "../testing/test-database";

const database = createDatabase(getTestDatabaseUrl());
const password = randomBytes(18).toString("base64url");
let passwordHash: string;

async function createUser(email = "schema-test@example.com") {
  return database.getRepository(User).save({
    name: "Schema test",
    email,
    password: passwordHash,
    role: "Requester",
  });
}

function insertRequest(userId: number, startDate = "2035-01-10", endDate = "2035-01-12") {
  return database.getRepository(VacationRequest).insert({ userId, startDate, endDate });
}

describe("initial schema and demo seed", () => {
  beforeAll(async () => {
    await database.initialize();
    passwordHash = await hash(password, 12);
  });

  beforeEach(async () => {
    await database.query("TRUNCATE vacation_requests, users RESTART IDENTITY");
  });

  afterAll(async () => {
    if (!database.isInitialized) return;
    await database.destroy();
  });

  it("creates exactly the assignment columns, date types, and listing indexes", async () => {
    const columns = await database.query<
      { table_name: string; column_name: string; data_type: string }[]
    >(
      "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('users', 'vacation_requests') ORDER BY ordinal_position",
    );
    expect(
      columns.filter((column) => column.table_name === "users").map((column) => column.column_name),
    ).toEqual(["id", "name", "email", "password", "role", "created_at"]);
    expect(
      columns
        .filter((column) => column.table_name === "vacation_requests")
        .map((column) => column.column_name),
    ).toEqual([
      "id",
      "user_id",
      "start_date",
      "end_date",
      "reason",
      "status",
      "comments",
      "created_at",
      "updated_at",
    ]);
    expect(
      columns
        .filter((column) => ["start_date", "end_date"].includes(column.column_name))
        .map((column) => column.data_type),
    ).toEqual(["date", "date"]);
    const indexes = await database.query<{ indexdef: string }[]>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('vacation_requests_status_created_id_idx', 'vacation_requests_user_created_id_idx')",
    );
    expect(indexes.map((index) => index.indexdef).join("\n")).toContain(
      "(status, created_at DESC, id DESC)",
    );
    expect(indexes.map((index) => index.indexdef).join("\n")).toContain(
      "(user_id, created_at DESC, id DESC)",
    );
    expect(await database.runMigrations()).toEqual([]);
  });

  it("enforces unique email, allowed roles/statuses, foreign keys, dates, and rejection comments", async () => {
    const user = await createUser();
    await expect(createUser()).rejects.toMatchObject({ driverError: { code: "23505" } });
    await expect(
      database.query("UPDATE users SET role = 'Other' WHERE id = $1", [user.id]),
    ).rejects.toMatchObject({ driverError: { code: "23514" } });
    await expect(insertRequest(999_999)).rejects.toMatchObject({ driverError: { code: "23503" } });
    await expect(insertRequest(user.id, "2035-01-10", "2035-01-10")).rejects.toMatchObject({
      driverError: { code: "23514" },
    });
    await insertRequest(user.id);
    await expect(
      database.query("UPDATE vacation_requests SET status = 'Other'"),
    ).rejects.toMatchObject({ driverError: { code: "23514" } });
    await expect(
      database.query("UPDATE vacation_requests SET status = 'Rejected', comments = '   '"),
    ).rejects.toMatchObject({ driverError: { code: "23514" } });
    await expect(
      database.query("UPDATE vacation_requests SET status = 'Rejected', comments = NULL"),
    ).rejects.toMatchObject({ driverError: { code: "23514" } });
  });

  it("blocks inclusive overlaps but permits another user and Rejected requests", async () => {
    const first = await createUser();
    const second = await createUser("another@example.com");
    await insertRequest(first.id);
    await expect(insertRequest(first.id, "2035-01-12", "2035-01-14")).rejects.toMatchObject({
      driverError: { code: "23P01" },
    });
    await insertRequest(second.id);
    await database.getRepository(VacationRequest).insert({
      userId: first.id,
      startDate: "2035-01-11",
      endDate: "2035-01-14",
      status: "Rejected",
      comments: "Coverage needed",
    });
    await expect(
      database.query("UPDATE vacation_requests SET status = 'Approved' WHERE status = 'Rejected'"),
    ).rejects.toMatchObject({ driverError: { code: "23P01" } });
    await insertRequest(first.id, "2035-01-13", "2035-01-15");
  });

  it("prevents overlapping inserts from two concurrent transactions", async () => {
    const user = await createUser();
    const first = database.createQueryRunner();
    const second = database.createQueryRunner();
    try {
      await first.startTransaction();
      await second.startTransaction();
      const sql =
        "INSERT INTO vacation_requests (user_id, start_date, end_date) VALUES ($1, '2035-02-01', '2035-02-03')";
      await first.query(sql, [user.id]);
      let settled = false;
      const competing = second.query(sql, [user.id]).then(
        () => {
          settled = true;
          return null;
        },
        (error: unknown) => {
          settled = true;
          return error;
        },
      );
      await setTimeout(100);
      expect(settled).toBe(false);
      await first.commitTransaction();
      expect(await competing).toMatchObject({ code: "23P01" });
    } finally {
      if (first.isTransactionActive) await first.rollbackTransaction();
      if (second.isTransactionActive) await second.rollbackTransaction();
      await first.release();
      await second.release();
    }
  });

  it("seeds hashed demo accounts and 16 requests once, preserving dates on later runs", async () => {
    const first = await seedDemoData(database, password, new Date("2030-03-28T22:30:00Z"));
    expect(first).toEqual({ users: 3, requestsCreated: 16 });
    const requests = await database.getRepository(VacationRequest).find({ order: { id: "ASC" } });
    expect(requests[0]?.startDate).toBe("2030-03-31");
    expect(typeof requests[0]?.startDate).toBe("string");
    expect(new Set(requests.map((request) => request.status))).toEqual(
      new Set(["Pending", "Approved", "Rejected"]),
    );
    for (const request of requests.filter((request) => request.status === "Rejected")) {
      expect(request.comments?.trim()).toBeTruthy();
    }
    const users = await database
      .getRepository(User)
      .createQueryBuilder("user")
      .addSelect("user.password")
      .getMany();
    expect(users.filter((user) => user.role === "Requester")).toHaveLength(2);
    expect(users.filter((user) => user.role === "Validator")).toHaveLength(1);
    for (const user of users) {
      expect(user.password).not.toBe(password);
      expect(await compare(password, user.password)).toBe(true);
      expect(user.password).toMatch(/^\$2[ab]\$12\$/);
    }
    expect(
      (await database.getRepository(User).findOneByOrFail({ email: "alice@example.com" })).password,
    ).toBeUndefined();
    expect(await seedDemoData(database, password, new Date("2030-04-02T10:00:00Z"))).toEqual({
      users: 3,
      requestsCreated: 0,
    });
    expect(await database.getRepository(User).count()).toBe(3);
    expect(await database.getRepository(VacationRequest).find({ order: { id: "ASC" } })).toEqual(
      requests,
    );
  });

  it("can revert and reapply the migration", async () => {
    await database.undoLastMigration();
    expect(
      await database.query(
        "SELECT to_regclass('public.users') AS users, to_regclass('public.vacation_requests') AS requests",
      ),
    ).toEqual([{ users: null, requests: null }]);
    expect(await database.runMigrations()).toHaveLength(1);
  });
});
