export type Role = "Requester" | "Validator";

export type VacationStatus = "Pending" | "Approved" | "Rejected";

export interface SafeUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: SafeUser;
}

export interface Employee {
  id: number;
  name: string;
}

export interface VacationRequest {
  id: number;
  userId: number;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: VacationStatus;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
  user?: Employee;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Items<T> {
  items: T[];
}

export interface TeamVacation {
  name: string;
  startDate: string;
  endDate: string;
}

export interface RequestFilters {
  status?: VacationStatus;
  userId?: number;
}

export interface CreateRequestInput {
  startDate: string;
  endDate: string;
  reason?: string;
}
