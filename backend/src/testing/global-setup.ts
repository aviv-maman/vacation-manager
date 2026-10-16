import { createDatabase } from "../database/data-source";
import { getTestDatabaseUrl } from "./test-database";

export default async function setup() {
  const database = await createDatabase(getTestDatabaseUrl()).initialize();

  try {
    const tables = await database.query<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'migrations'",
    );

    if (tables.length > 0) throw new Error("Use an empty, dedicated test database");

    const migrations = await database.runMigrations();

    if (migrations.length !== 1)
      throw new Error("Expected one initial migration in the empty test database");
  } catch (error) {
    await database.destroy();
    throw error;
  }

  return async () => {
    try {
      await database.undoLastMigration();
    } finally {
      await database.destroy();
    }
  };
}
