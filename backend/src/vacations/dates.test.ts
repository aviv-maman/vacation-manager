import { describe, expect, it } from "vitest";
import { isDateOnly, todayInJerusalem, validateVacationDates } from "./dates";

describe("vacation calendar dates", () => {
  it.each(["2032-02-29", "2030-01-01", "2030-12-31"])("accepts real dates: %s", (date) => {
    expect(isDateOnly(date)).toBe(true);
  });

  it.each([
    "2030-02-29",
    "2030-02-30",
    "2030-04-31",
    "2030-00-10",
    "2030-13-10",
    "2030-01-00",
    "2030-01-32",
    "2030-1-02",
    "2030-01-02T00:00:00Z",
    "0000-01-01",
    " 2030-01-02",
    "",
  ])("rejects invalid or non-date-only values: %s", (date) => {
    expect(isDateOnly(date)).toBe(false);
  });

  it("uses the Jerusalem date across local midnight, year changes, and DST", () => {
    expect(todayInJerusalem(new Date("2030-12-31T21:59:59Z"))).toBe("2030-12-31");
    expect(todayInJerusalem(new Date("2030-12-31T22:00:00Z"))).toBe("2031-01-01");
    expect(todayInJerusalem(new Date("2030-07-01T21:00:00Z"))).toBe("2030-07-02");
  });

  it("allows starting today even when the UTC date is still yesterday", () => {
    expect(() =>
      validateVacationDates("2030-07-02", "2030-07-03", new Date("2030-07-01T21:00:00Z")),
    ).not.toThrow();
    expect(() =>
      validateVacationDates("2030-07-01", "2030-07-03", new Date("2030-07-01T21:00:00Z")),
    ).toThrow("past");
  });

  it.each([
    ["2030-02-30", "2030-03-03"],
    ["2030-03-01", "2030-03-01"],
    ["2030-03-02", "2030-03-01"],
  ])("rejects impossible dates and non-increasing ranges: %s to %s", (start, end) => {
    expect(() => validateVacationDates(start, end, new Date("2030-01-01T00:00:00Z"))).toThrow();
  });
});
