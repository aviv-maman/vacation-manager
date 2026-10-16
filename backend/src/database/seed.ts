import { getDatabase } from "./data-source";
import { seedDemoData } from "./seed-demo-data";

async function main(): Promise<void> {
  const password = process.env.SEED_DEMO_PASSWORD;

  if (!password) throw new Error("Set SEED_DEMO_PASSWORD using the demo password in the README");

  const database = await getDatabase();

  try {
    console.log(JSON.stringify(await seedDemoData(database, password)));
  } finally {
    await database.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error("Seed failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
