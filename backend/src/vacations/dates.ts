import { HttpError } from "../errors/HttpError";

export function todayInJerusalem(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
}

export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateVacationDates(startDate: string, endDate: string, now = new Date()): void {
  if (!isDateOnly(startDate) || !isDateOnly(endDate)) {
    throw new HttpError(400, "Dates must be real calendar dates in YYYY-MM-DD format");
  }
  if (endDate <= startDate) throw new HttpError(400, "End date must be after start date");
  if (startDate < todayInJerusalem(now)) {
    throw new HttpError(400, "Vacation requests cannot start in the past (Asia/Jerusalem)");
  }
}
