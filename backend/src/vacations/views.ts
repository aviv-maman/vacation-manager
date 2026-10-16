import type { VacationRequest } from "../entities/VacationRequest";

export function requestView(request: VacationRequest) {
  return {
    id: request.id,
    userId: request.userId,
    startDate: request.startDate,
    endDate: request.endDate,
    reason: request.reason,
    status: request.status,
    comments: request.comments,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}
