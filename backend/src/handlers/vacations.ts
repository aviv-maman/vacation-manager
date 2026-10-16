import { Response } from "commoneventframework";
import { requireUser } from "../auth/require-user";
import { getDatabase } from "../database/data-source";
import { HttpError } from "../errors/HttpError";
import {
  ApproveVacationRequestCommand,
  CreateVacationRequestCommand,
  RejectVacationRequestCommand,
} from "../vacations/commands";
import type { CreateVacationRequestInput } from "../vacations/commands";
import { requestView } from "../vacations/views";
import type { CommonEvent, HandlerFn, InputParserFn } from "./types";

const maxTextLength = 500;

function jsonObject(event: CommonEvent): Record<string, unknown> {
  let body: unknown;

  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    throw new HttpError(400, "Provide a JSON object");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Provide a JSON object");
  }

  return body as Record<string, unknown>;
}

export const parseCreateInput: InputParserFn<CreateVacationRequestInput> = (event) => {
  const { startDate, endDate, reason } = jsonObject(event);

  if (
    typeof startDate !== "string" ||
    typeof endDate !== "string" ||
    (reason !== undefined && typeof reason !== "string")
  ) {
    throw new HttpError(
      400,
      "Start and end dates are required strings; reason is an optional string",
    );
  }
  if (reason !== undefined && reason.length > maxTextLength) {
    throw new HttpError(400, "Reason must not exceed 500 characters");
  }

  return { startDate, endDate, reason };
};

interface DecisionInput {
  requestId: number;
}

function requestId(event: CommonEvent): number {
  const id = event.pathParameters?.id;

  if (!id || !/^[1-9]\d*$/.test(id) || Number(id) > 2_147_483_647) {
    throw new HttpError(400, "Request ID must be a positive integer");
  }

  return Number(id);
}

export const parseDecisionInput: InputParserFn<DecisionInput> = (event) => ({
  requestId: requestId(event),
});

interface RejectionInput extends DecisionInput {
  comments: string;
}

export const parseRejectInput: InputParserFn<RejectionInput> = (event) => {
  const id = requestId(event);
  const { comments } = jsonObject(event);

  if (typeof comments !== "string") {
    throw new HttpError(400, "A rejection comment is required");
  }
  if (comments.length > maxTextLength) {
    throw new HttpError(400, "Rejection comment must not exceed 500 characters");
  }

  return { requestId: id, comments };
};

export const createVacation: HandlerFn<CreateVacationRequestInput> = async (input, event) => {
  const actor = await requireUser(event, ["Requester"]);
  const command = new CreateVacationRequestCommand(await getDatabase());

  return new Response(201, { request: requestView(await command.execute(actor, input)) });
};

export const approveVacation: HandlerFn<DecisionInput> = async ({ requestId }, event) => {
  const actor = await requireUser(event, ["Validator"]);
  const command = new ApproveVacationRequestCommand(await getDatabase());

  return new Response(200, { request: requestView(await command.execute(actor, requestId)) });
};

export const rejectVacation: HandlerFn<RejectionInput> = async ({ requestId, comments }, event) => {
  const actor = await requireUser(event, ["Validator"]);
  const command = new RejectVacationRequestCommand(await getDatabase());

  return new Response(200, {
    request: requestView(await command.execute(actor, requestId, comments)),
  });
};
