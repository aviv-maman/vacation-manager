import { getDatabase } from "./data-source";

async function main(): Promise<void> {
  const database = await getDatabase();
  try {
    if (process.argv[2] === "revert") {
      await database.undoLastMigration();
      console.log("Reverted the latest migration, if one was applied.");
    } else if (process.argv[2] === "run") {
      const migrations = await database.runMigrations();
      console.log(`Applied ${migrations.length} migration(s).`);
    } else {
      throw new Error("Expected migration action: run or revert");
    }
  } finally {
    await database.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error("Migration failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
