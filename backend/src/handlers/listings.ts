import { Response } from "commoneventframework";
import { requireUser } from "../auth/require-user";
import { getDatabase } from "../database/data-source";
import { HttpError } from "../errors/HttpError";
import { isDateOnly } from "../vacations/dates";
import { listRequesters, listRequests, listTeamVacations } from "../vacations/queries";
import type { RequestListInput, TeamRangeInput } from "../vacations/queries";
import type { HandlerFn, InputParserFn } from "./types";

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || Number(value) > 2_147_483_647) {
    throw new HttpError(400, `${name} must be a positive integer up to 2147483647`);
  }
  return Number(value);
}

function pageNumber(value: string | undefined): number {
  return value === undefined ? 1 : positiveInteger(value, "Page");
}

export const parseMineInput: InputParserFn<Pick<RequestListInput, "page">> = (event) => ({
  page: pageNumber(event.queryStringParameters?.page),
});

export const parseListInput: InputParserFn<RequestListInput> = (event) => {
  const { page, status, userId } = event.queryStringParameters ?? {};
  if (
    status !== undefined &&
    status !== "Pending" &&
    status !== "Approved" &&
    status !== "Rejected"
  ) {
    throw new HttpError(400, "Status must be Pending, Approved, or Rejected");
  }
  return {
    page: pageNumber(page),
    status,
    userId: userId === undefined ? undefined : positiveInteger(userId, "User ID"),
  };
};

export const parseRequesterInput: InputParserFn = (event) => {
  const role = event.queryStringParameters?.role;
  if (role !== undefined && role !== "Requester") {
    throw new HttpError(400, "This endpoint supports only role=Requester");
  }
  return {};
};

export const parseTeamInput: InputParserFn<TeamRangeInput> = (event) => {
  const { from, to } = event.queryStringParameters ?? {};
  if (typeof from !== "string" || typeof to !== "string" || !isDateOnly(from) || !isDateOnly(to)) {
    throw new HttpError(400, "From and to must be real calendar dates in YYYY-MM-DD format");
  }
  if (to < from) throw new HttpError(400, "To date must be on or after from date");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days > 366) throw new HttpError(400, "Team date range must not exceed 366 days");
  return { from, to };
};

export const getMine: HandlerFn<Pick<RequestListInput, "page">> = async ({ page }, event) => {
  const actor = await requireUser(event, ["Requester"]);
  return new Response(200, await listRequests(await getDatabase(), { page, userId: actor.id }), {
    "Cache-Control": "no-store",
  });
};

export const getRequests: HandlerFn<RequestListInput> = async (input, event) => {
  await requireUser(event, ["Validator"]);
  return new Response(200, await listRequests(await getDatabase(), input), {
    "Cache-Control": "no-store",
  });
};

export const getRequesters: HandlerFn = async (_input, event) => {
  await requireUser(event, ["Validator"]);
  return new Response(200, await listRequesters(await getDatabase()), {
    "Cache-Control": "no-store",
  });
};

export const getTeamVacations: HandlerFn<TeamRangeInput> = async (input, event) => {
  await requireUser(event, ["Requester", "Validator"]);
  return new Response(200, await listTeamVacations(await getDatabase(), input), {
    "Cache-Control": "no-store",
  });
};
