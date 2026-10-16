import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { VacationRequest } from "../entities/VacationRequest";
import { InitialSchema1792108800000 } from "./migrations/1792108800000-InitialSchema";

let databaseReady: Promise<DataSource> | undefined;

export function createDatabase(url: string): DataSource {
  return new DataSource({
    type: "postgres",
    url,
    entities: [User, VacationRequest],
    migrations: [InitialSchema1792108800000],
    synchronize: false,
    migrationsRun: false,
    poolSize: 5,
    connectTimeoutMS: 5000,
    extra: { query_timeout: 5000 },
    logging: false,
  });
}

export function getDatabase(): Promise<DataSource> {
  if (!databaseReady) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");

    const database = createDatabase(url);

    // Reuse one connection pool. Allow another attempt if initialization fails.
    databaseReady = database.initialize().catch((error: unknown) => {
      databaseReady = undefined;
      throw error;
    });
  }

  return databaseReady;
}
