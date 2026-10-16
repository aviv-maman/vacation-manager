import type { LocationQueryValue } from "vue-router";

type QueryValue = LocationQueryValue | LocationQueryValue[] | undefined;

export function positiveIntegerQuery(value: QueryValue): number | undefined {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return;

  const number = Number(value);

  return number <= 2_147_483_647 ? number : undefined;
}

export function calendarDateQuery(value: QueryValue): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
    return;

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return value;
}
