import type { DataSource } from "typeorm";
import type { SafeUser } from "../auth/require-user";
import { VacationRequest } from "../entities/VacationRequest";
import { HttpError } from "../errors/HttpError";
import { validateVacationDates } from "./dates";
import { businessEvents, BusinessEventPublisher } from "./events";

export interface CreateVacationRequestInput {
  startDate: string;
  endDate: string;
  reason?: string;
}

export class CreateVacationRequestCommand {
  constructor(
    private readonly database: DataSource,
    private readonly events: BusinessEventPublisher = businessEvents,
  ) {}

  async execute(actor: SafeUser, input: CreateVacationRequestInput): Promise<VacationRequest> {
    if (actor.role !== "Requester") throw new HttpError(403, "Forbidden");
    validateVacationDates(input.startDate, input.endDate);

    const request = await this.database.transaction(async (manager) => {
      const repository = manager.getRepository(VacationRequest);
      const overlaps = await repository
        .createQueryBuilder("request")
        .where("request.userId = :userId", { userId: actor.id })
        .andWhere("request.status IN (:...statuses)", { statuses: ["Pending", "Approved"] })
        .andWhere("request.startDate <= :endDate AND request.endDate >= :startDate", input)
        .getExists();
      if (overlaps) {
        throw new HttpError(409, "Vacation dates overlap an existing Pending or Approved request");
      }
      // The exclusion constraint also rejects a competing insert after this check.
      return repository.save(
        repository.create({
          userId: actor.id,
          startDate: input.startDate,
          endDate: input.endDate,
          reason: input.reason?.trim() || null,
          status: "Pending",
          comments: null,
        }),
      );
    });

    await this.events.publish({
      type: "VacationRequestCreatedEvent",
      requestId: request.id,
      userId: request.userId,
      actorId: actor.id,
      occurredAt: new Date().toISOString(),
    });
    return request;
  }
}

async function decideRequest(
  database: DataSource,
  events: BusinessEventPublisher,
  actor: SafeUser,
  requestId: number,
  status: "Approved" | "Rejected",
  comments: string | null,
): Promise<VacationRequest> {
  if (actor.role !== "Validator") throw new HttpError(403, "Forbidden");
  if (status === "Rejected" && !comments?.trim()) {
    throw new HttpError(400, "A nonblank rejection comment is required");
  }
  const request = await database.transaction(async (manager) => {
    const repository = manager.getRepository(VacationRequest);
    const existing = await repository.findOne({
      where: { id: requestId },
      lock: { mode: "pessimistic_write" },
    });
    if (!existing) throw new HttpError(404, "Vacation request not found");
    // A competing decision waits for the row lock, then sees the committed status.
    if (existing.status !== "Pending") {
      throw new HttpError(409, "Only Pending requests can be approved or rejected");
    }
    existing.status = status;
    existing.comments = comments?.trim() || null;
    return repository.save(existing);
  });

  await events.publish({
    type: status === "Approved" ? "VacationRequestApprovedEvent" : "VacationRequestRejectedEvent",
    requestId: request.id,
    userId: request.userId,
    actorId: actor.id,
    occurredAt: new Date().toISOString(),
  });
  return request;
}

export class ApproveVacationRequestCommand {
  constructor(
    private readonly database: DataSource,
    private readonly events: BusinessEventPublisher = businessEvents,
  ) {}

  execute(actor: SafeUser, requestId: number): Promise<VacationRequest> {
    return decideRequest(this.database, this.events, actor, requestId, "Approved", null);
  }
}

export class RejectVacationRequestCommand {
  constructor(
    private readonly database: DataSource,
    private readonly events: BusinessEventPublisher = businessEvents,
  ) {}

  execute(actor: SafeUser, requestId: number, comments: string): Promise<VacationRequest> {
    return decideRequest(this.database, this.events, actor, requestId, "Rejected", comments);
  }
}
