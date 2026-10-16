import { hash } from "bcryptjs";
import type { DataSource } from "typeorm";
import { User } from "../entities/User";
import { VacationRequest } from "../entities/VacationRequest";
import type { VacationStatus } from "../entities/VacationRequest";
import { todayInJerusalem } from "../vacations/dates";

const demoUsers = [
  { name: "Alice Requester", email: "alice@example.com", role: "Requester" },
  { name: "Bob Requester", email: "bob@example.com", role: "Requester" },
  { name: "Maya Validator", email: "maya@example.com", role: "Validator" },
] as const;

function dateAfter(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export async function seedDemoData(database: DataSource, password: string, now = new Date()) {
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error(
      "SEED_DEMO_PASSWORD must contain at least 12 characters and at most 72 UTF-8 bytes",
    );
  }
  const today = todayInJerusalem(now);
  const users = await Promise.all(
    demoUsers.map(async (user) => ({ ...user, password: await hash(password, 12) })),
  );

  return database.transaction(async (manager) => {
    // Serialize seed runs, so simultaneous runs cannot insert duplicate demo requests.
    await manager.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "vacation-manager-demo-seed",
    ]);
    let requestsCreated = 0;

    for (const [userIndex, user] of users.entries()) {
      await manager.upsert(User, user, ["email"]);
      const savedUser = await manager.findOneByOrFail(User, { email: user.email });
      if (user.role !== "Requester") continue;
      // Keep existing dates and decisions intact, including when reseeding on a later day.
      if ((await manager.countBy(VacationRequest, { userId: savedUser.id })) > 0) continue;

      for (let index = 0; index < 8; index++) {
        const status: VacationStatus = (["Pending", "Approved", "Rejected"] as const)[index % 3]!;
        const startDate = dateAfter(today, 2 + userIndex + index * 4);
        await manager.insert(VacationRequest, {
          userId: savedUser.id,
          startDate,
          endDate: dateAfter(startDate, 2),
          reason: index % 4 === 0 ? null : "Personal time off",
          status,
          comments: status === "Rejected" ? "Coverage is needed on these dates." : null,
        });
        requestsCreated++;
      }
    }

    return { users: users.length, requestsCreated };
  });
}
