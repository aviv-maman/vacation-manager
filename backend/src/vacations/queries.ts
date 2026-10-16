import type { DataSource } from "typeorm";
import { User } from "../entities/User";
import { VacationRequest } from "../entities/VacationRequest";
import type { VacationStatus } from "../entities/VacationRequest";
import { requestView } from "./views";

export interface RequestListInput {
  page: number;
  status?: VacationStatus;
  userId?: number;
}

export interface TeamRangeInput {
  from: string;
  to: string;
}

const pageSize = 10;

export async function listRequests(database: DataSource, input: RequestListInput) {
  const query = database
    .getRepository(VacationRequest)
    .createQueryBuilder("request")
    .innerJoin("request.user", "employee")
    .select("request")
    .addSelect(["employee.id", "employee.name"])
    .orderBy("request.createdAt", "DESC")
    .addOrderBy("request.id", "DESC")
    .skip((input.page - 1) * pageSize)
    .take(pageSize);

  if (input.status !== undefined) {
    query.andWhere("request.status = :status", { status: input.status });
  }
  if (input.userId !== undefined) {
    query.andWhere("request.userId = :userId", { userId: input.userId });
  }

  const [requests, total] = await query.getManyAndCount();

  return {
    items: requests.map((request) => ({
      ...requestView(request),
      user: { id: request.user.id, name: request.user.name },
    })),
    page: input.page,
    pageSize,
    total,
  };
}

export async function listRequesters(database: DataSource) {
  const users = await database.getRepository(User).find({
    where: { role: "Requester" },
    select: { id: true, name: true },
    order: { name: "ASC", id: "ASC" },
  });

  return { items: users.map((user) => ({ id: user.id, name: user.name })) };
}

export async function listTeamVacations(database: DataSource, range: TeamRangeInput) {
  const requests = await database
    .getRepository(VacationRequest)
    .createQueryBuilder("request")
    .innerJoin("request.user", "employee")
    .select(["request.id", "request.startDate", "request.endDate", "employee.id", "employee.name"])
    .where("request.status = :status", { status: "Approved" })
    .andWhere("request.startDate <= :to AND request.endDate >= :from", range)
    .orderBy("request.startDate", "ASC")
    .addOrderBy("request.id", "ASC")
    // Entity hydration preserves TypeORM's DATE-as-string mapping.
    .getMany();

  return {
    items: requests.map((request) => ({
      name: request.user.name,
      startDate: request.startDate,
      endDate: request.endDate,
    })),
  };
}
