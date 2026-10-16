import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "../entities/User";

let databaseReady: Promise<DataSource> | undefined;

export function getDatabase(): Promise<DataSource> {
  if (!databaseReady) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");

    const database = new DataSource({
      type: "postgres",
      url,
      entities: [User],
      synchronize: false,
      migrationsRun: false,
      poolSize: 5,
      connectTimeoutMS: 5000,
      extra: { query_timeout: 5000 },
      logging: false,
    });

    // Reuse one connection pool. Allow another attempt if initialization fails.
    databaseReady = database.initialize().catch((error: unknown) => {
      databaseReady = undefined;
      throw error;
    });
  }

  return databaseReady;
}
