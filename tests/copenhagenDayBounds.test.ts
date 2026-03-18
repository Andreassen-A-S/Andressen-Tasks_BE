import { describe, expect, test } from "bun:test";
import { copenhagenDayBounds } from "../src/repositories/taskRepository";

/**
 * Copenhagen is UTC+1 (CET) in winter and UTC+2 (CEST) in summer.
 * Midnight Copenhagen in UTC:
 *   CET:  previous day at 23:00 UTC
 *   CEST: previous day at 22:00 UTC
 */

describe("copenhagenDayBounds", () => {
  test("CET (UTC+1): returns correct [start, end) for a winter date", () => {
    // 2024-01-15 at 07:25 CET = 06:25 UTC (cron fire time)
    const input = new Date("2024-01-15T06:25:00Z");
    const { start, end } = copenhagenDayBounds(input);

    expect(start.toISOString()).toBe("2024-01-14T23:00:00.000Z"); // midnight CET
    expect(end.toISOString()).toBe("2024-01-15T23:00:00.000Z"); // next midnight CET
    expect(end.getTime() - start.getTime()).toBe(24 * 3_600_000); // 24-hour day
  });

  test("CEST (UTC+2): returns correct [start, end) for a summer date", () => {
    // 2024-07-15 at 08:25 CEST = 06:25 UTC
    const input = new Date("2024-07-15T06:25:00Z");
    const { start, end } = copenhagenDayBounds(input);

    expect(start.toISOString()).toBe("2024-07-14T22:00:00.000Z"); // midnight CEST
    expect(end.toISOString()).toBe("2024-07-15T22:00:00.000Z"); // next midnight CEST
    expect(end.getTime() - start.getTime()).toBe(24 * 3_600_000);
  });

  test("DST spring-forward (2024-03-31): 23-hour day, start in CET, end in CEST", () => {
    // Clocks move forward at 02:00 CET → 03:00 CEST.
    // Midnight Copenhagen = 2024-03-30T23:00Z (CET).
    // Next midnight Copenhagen = 2024-03-31T22:00Z (CEST).
    const input = new Date("2024-03-31T18:00:00Z"); // 20:00 CEST
    const { start, end } = copenhagenDayBounds(input);

    expect(start.toISOString()).toBe("2024-03-30T23:00:00.000Z");
    expect(end.toISOString()).toBe("2024-03-31T22:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(23 * 3_600_000); // shorter day
  });

  test("DST fall-back (2024-10-27): 25-hour day, start in CEST, end in CET", () => {
    // Clocks move back at 03:00 CEST → 02:00 CET.
    // Midnight Copenhagen = 2024-10-26T22:00Z (CEST).
    // Next midnight Copenhagen = 2024-10-27T23:00Z (CET).
    const input = new Date("2024-10-27T18:00:00Z"); // 20:00 CEST → 19:00 CET
    const { start, end } = copenhagenDayBounds(input);

    expect(start.toISOString()).toBe("2024-10-26T22:00:00.000Z");
    expect(end.toISOString()).toBe("2024-10-27T23:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(25 * 3_600_000); // longer day
  });

  test("input date is contained within its own [start, end) bounds", () => {
    const cases = [
      "2024-01-15T06:25:00Z",
      "2024-07-15T20:00:00Z",
      "2024-03-31T18:00:00Z",
      "2024-10-27T18:00:00Z",
    ];
    for (const iso of cases) {
      const input = new Date(iso);
      const { start, end } = copenhagenDayBounds(input);
      expect(input.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(input.getTime()).toBeLessThan(end.getTime());
    }
  });

  test("adjacent days produce non-overlapping, contiguous ranges", () => {
    const day1 = copenhagenDayBounds(new Date("2024-01-15T12:00:00Z"));
    const day2 = copenhagenDayBounds(new Date("2024-01-16T12:00:00Z"));

    expect(day1.end.getTime()).toBe(day2.start.getTime());
  });
});
