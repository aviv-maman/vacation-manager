import { Response } from "commoneventframework";
import { getDatabase } from "../database/data-source";
import type { HandlerFn } from "./types";

export const getHealth: HandlerFn = async () => {
  try {
    const database = await getDatabase();
    await database.query("SELECT 1");

    return {
      status: "ok",
      database: "connected",
      entityMappings: database.entityMetadatas.map((entity) => entity.tableName),
    };
  } catch {
    console.error(JSON.stringify({ type: "DatabaseHealthCheckFailed" }));
    return new Response(503, { status: "error", database: "unavailable" });
  }
};
