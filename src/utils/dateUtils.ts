import { startOfWeek, startOfMonth, addDays, subDays, format } from "date-fns";

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Europe/Copenhagen";

/**
 * Returns the UTC offset in milliseconds for the given timezone at a specific UTC instant.
 */
function getUTCOffsetMs(utcDate: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcDate);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  let ms =
    ((get("hour") % 24 - utcDate.getUTCHours()) * 60 +
      (get("minute") - utcDate.getUTCMinutes())) *
      60_000 +
    (get("second") - utcDate.getUTCSeconds()) * 1_000;
  if (ms > 12 * 3_600_000) ms -= 24 * 3_600_000;
  if (ms < -12 * 3_600_000) ms += 24 * 3_600_000;
  return ms;
}

/**
 * Returns half-open [start, end) UTC bounds for the calendar day that `date`
 * falls on in the app timezone, correctly handling DST transitions.
 */
export function appDayBounds(date: Date): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE })
    .format(date)
    .split("-")
    .map(Number) as [number, number, number];

  const [year, month, day] = parts;
  const midnightUTC = new Date(Date.UTC(year, month - 1, day));
  const nextMidnightUTC = new Date(Date.UTC(year, month - 1, day + 1));

  return {
    start: new Date(midnightUTC.getTime() - getUTCOffsetMs(midnightUTC, APP_TIMEZONE)),
    end: new Date(nextMidnightUTC.getTime() - getUTCOffsetMs(nextMidnightUTC, APP_TIMEZONE)),
  };
}

/**
 * Returns the date key (YYYY-MM-DD) for a UTC Date as seen in the app timezone.
 */
export function appDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(date);
}

function dateKeyToLocal(key: string): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/**
 * Returns the UTC DateTime bounds for a given YYYY-MM-DD date key.
 * Uses noon UTC to safely handle DST transition days.
 */
export function dateKeyBounds(key: string): { start: Date; end: Date } {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return appDayBounds(new Date(Date.UTC(y, m - 1, d, 12)));
}

/**
 * Returns the Monday of the current app-timezone week as YYYY-MM-DD.
 */
export function appWeekStartKey(date = new Date()): string {
  const today = dateKeyToLocal(appDateKey(date));
  return format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

/**
 * Returns the first day of the current app-timezone month as YYYY-MM-DD.
 */
export function appMonthStartKey(date = new Date()): string {
  const today = dateKeyToLocal(appDateKey(date));
  return format(startOfMonth(today), "yyyy-MM-dd");
}

/**
 * Returns UTC DateTime bounds for the current app-timezone week (Mon–Sun).
 */
export function appWeekBoundsUTC(date = new Date()): { start: Date; end: Date } {
  const weekStartKey = appWeekStartKey(date);
  const weekEndKey = addDaysToKey(weekStartKey, 7);
  return {
    start: dateKeyBounds(weekStartKey).start,
    end: dateKeyBounds(weekEndKey).start,
  };
}

/**
 * Returns the UTC DateTime for the start of the current app-timezone month.
 */
export function appMonthStartUTC(date = new Date()): Date {
  return dateKeyBounds(appMonthStartKey(date)).start;
}

/**
 * Adds N days to a YYYY-MM-DD date key and returns a new date key.
 */
export function addDaysToKey(key: string, days: number): string {
  return format(addDays(dateKeyToLocal(key), days), "yyyy-MM-dd");
}

/**
 * Subtracts N days from a YYYY-MM-DD date key and returns a new date key.
 */
export function subDaysFromKey(key: string, days: number): string {
  return format(subDays(dateKeyToLocal(key), days), "yyyy-MM-dd");
}
