import { QueryFailedError } from "typeorm";
import { HttpError } from "./HttpError";

export function databaseHttpError(error: unknown): HttpError | undefined {
  if (!(error instanceof QueryFailedError)) return undefined;

  const { code } = error.driverError as { code?: string };

  if (code === "23P01") {
    return new HttpError(409, "Vacation dates overlap an existing Pending or Approved request");
  }
  if (code === "23514") {
    return new HttpError(400, "Vacation request does not satisfy the business rules");
  }

  return undefined;
}
