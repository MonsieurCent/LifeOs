/**
 * Standardized Date and Time Utilities for LifeOS / Pulse App
 * 
 * Strict separation of concerns:
 * 1. Exact Event Timestamps: Stored as ISO 8601 UTC strings (e.g., "2026-09-14T10:21:07.000Z").
 * 2. Date-Only Calendar Values: Stored as ISO calendar dates "YYYY-MM-DD" without timezone shifts.
 * 3. Recurring Schedules: Mapped with Monday as index 0 (Monday ... Sunday).
 * 
 * Default user timezone: Europe/Oslo
 */

import { DayOfWeek } from "../types";

export const DEFAULT_TIMEZONE = "Europe/Oslo";
export const CANONICAL_PROGRAM_START_DATE = "2026-09-14";

export const DAYS_OF_WEEK: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

export const DAY_OFFSETS: Record<DayOfWeek, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6
};

// ==========================================
// 1. EXACT EVENT TIMESTAMPS (UTC)
// ==========================================

/**
 * Returns current exact UTC timestamp in ISO 8601 format.
 * Used for record creation, updates, and sync operations.
 */
export function getUtcNowISO(): string {
  return new Date().toISOString();
}

/**
 * Formats an exact UTC timestamp into user's timezone.
 */
export function formatTimestampInTimezone(
  utcIsoString?: string,
  timezone: string = DEFAULT_TIMEZONE,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!utcIsoString) return "";
  try {
    const d = new Date(utcIsoString);
    if (isNaN(d.getTime())) return utcIsoString;

    const defaultOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...options
    };

    return new Intl.DateTimeFormat("en-US", defaultOptions).format(d);
  } catch {
    return utcIsoString;
  }
}

// ==========================================
// 2. DATE-ONLY CALENDAR VALUES (YYYY-MM-DD)
// ==========================================

/**
 * Returns today's calendar date as YYYY-MM-DD in the user's timezone.
 * Resolves midnight boundary cases in the user's local timezone (e.g. Europe/Oslo).
 */
export function getTodayDateStr(timezone: string = DEFAULT_TIMEZONE): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(new Date()); // Formats as YYYY-MM-DD in en-CA
  } catch {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

/**
 * Parses a YYYY-MM-DD calendar string into a local Date at midnight (00:00:00).
 * Prevents UTC-offset and DST day shifting.
 */
export function parseLocalDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const cleanStr = String(dateStr).split("T")[0].trim();
  const parts = cleanStr.split("-").map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    // Note: parts[1] is 1-indexed month
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

/**
 * Formats a Date object into a YYYY-MM-DD calendar string without UTC conversion.
 */
export function formatLocalDateISO(d: Date): string {
  if (!d || isNaN(d.getTime())) return getTodayDateStr();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Validates whether a string is in YYYY-MM-DD calendar format.
 */
export function isValidDateStr(dateStr?: string): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
}

/**
 * Normalizes any date representation to YYYY-MM-DD without shifting historical records.
 */
export function normalizeCalendarDate(dateStr?: string): string {
  if (!dateStr) return getTodayDateStr();
  if (isValidDateStr(dateStr)) return dateStr.trim();
  const clean = String(dateStr).split("T")[0].trim();
  if (isValidDateStr(clean)) return clean;
  const parsed = parseLocalDate(dateStr);
  return formatLocalDateISO(parsed);
}

// ==========================================
// 3. DST-SAFE CALENDAR DAY ARITHMETIC
// ==========================================

/**
 * Adds or subtracts integer days to a YYYY-MM-DD date.
 * Safely handles month ends, leap years, year boundaries, and Daylight Saving Time (DST).
 */
export function addDaysToDate(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatLocalDateISO(d);
}

/**
 * Calculates the difference in integer calendar days between two YYYY-MM-DD dates (d2 - d1).
 */
export function getDifferenceInDays(dateStr1: string, dateStr2: string): number {
  const d1 = parseLocalDate(dateStr1);
  const d2 = parseLocalDate(dateStr2);
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

// ==========================================
// 4. WEEK & MONTH BOUNDARIES (MONDAY-FIRST)
// ==========================================

/**
 * Returns the Monday (YYYY-MM-DD) of the week containing the specified date.
 */
export function getWeekStartMonday(
  dateOrStr?: string | Date,
  timezone: string = DEFAULT_TIMEZONE
): string {
  let d: Date;
  if (!dateOrStr) {
    d = parseLocalDate(getTodayDateStr(timezone));
  } else if (typeof dateOrStr === "string") {
    d = parseLocalDate(dateOrStr);
  } else {
    d = new Date(dateOrStr.getFullYear(), dateOrStr.getMonth(), dateOrStr.getDate());
  }

  const day = d.getDay(); // 0 is Sun, 1 is Mon... 6 is Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return formatLocalDateISO(d);
}

/**
 * Returns Monday-first week boundaries { startOfWeek: YYYY-MM-DD, endOfWeek: YYYY-MM-DD }.
 */
export function getWeekBoundaries(
  dateOrStr?: string | Date,
  timezone: string = DEFAULT_TIMEZONE
): { startOfWeek: string; endOfWeek: string } {
  const monday = getWeekStartMonday(dateOrStr, timezone);
  const sunday = addDaysToDate(monday, 6);
  return {
    startOfWeek: monday,
    endOfWeek: sunday
  };
}

/**
 * Returns Month boundaries { startOfMonth: YYYY-MM-DD, endOfMonth: YYYY-MM-DD }.
 */
export function getMonthBoundaries(
  dateOrStr?: string | Date,
  timezone: string = DEFAULT_TIMEZONE
): { startOfMonth: string; endOfMonth: string } {
  const base = typeof dateOrStr === "string" ? parseLocalDate(dateOrStr) : (dateOrStr || parseLocalDate(getTodayDateStr(timezone)));
  const year = base.getFullYear();
  const month = base.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  return {
    startOfMonth: formatLocalDateISO(firstDay),
    endOfMonth: formatLocalDateISO(lastDay)
  };
}

/**
 * Returns the DayOfWeek name ("Monday" ... "Sunday") for a given date.
 */
export function getDayOfWeekName(dateStr: string): DayOfWeek {
  const d = parseLocalDate(dateStr);
  const dayIdx = d.getDay(); // 0 is Sun, 1 is Mon... 6 is Sat
  const mapping: DayOfWeek[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];
  return mapping[dayIdx] || "Monday";
}

/**
 * Computes exact YYYY-MM-DD date for a given week number and day in a training cycle.
 */
export function computeDateForDay(cycleStartDate: string, weekNumber: number, day: DayOfWeek): string {
  try {
    const baseMonday = getWeekStartMonday(cycleStartDate || getTodayDateStr());
    const offset = (weekNumber - 1) * 7 + (DAY_OFFSETS[day] ?? 0);
    return addDaysToDate(baseMonday, offset);
  } catch {
    return "";
  }
}

/**
 * Returns either overrideDate or current Monday date.
 */
export function getTodayOrCurrentMondayDate(overrideDate?: string, timezone: string = DEFAULT_TIMEZONE): string {
  if (overrideDate && isValidDateStr(overrideDate)) return overrideDate;
  return getWeekStartMonday(overrideDate, timezone);
}

// ==========================================
// 5. STANDARDIZED UI DATE FORMATTERS
// ==========================================

/**
 * Uniform friendly date formatter across the application:
 * e.g., "Mon, Sep 14, 2026" or "Sep 14, 2026"
 */
export function formatFriendlyDate(
  dateStr?: string,
  options?: { showWeekday?: boolean; showYear?: boolean }
): string {
  if (!dateStr) return "";
  try {
    const d = parseLocalDate(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const showWeekday = options?.showWeekday ?? true;
    const showYear = options?.showYear ?? true;

    return d.toLocaleDateString("en-US", {
      weekday: showWeekday ? "short" : undefined,
      month: "short",
      day: "numeric",
      year: showYear ? "numeric" : undefined
    });
  } catch {
    return dateStr;
  }
}

/**
 * Formats a date concisely for charts and small labels: e.g. "Sep 14"
 */
export function formatShortDate(dateStr?: string): string {
  return formatFriendlyDate(dateStr, { showWeekday: false, showYear: false });
}

/**
 * Formats relative or friendly date: "Today", "Yesterday", "Tomorrow", or "Mon, Sep 14"
 */
export function formatRelativeOrFriendly(
  dateStr?: string,
  timezone: string = DEFAULT_TIMEZONE
): string {
  if (!dateStr) return "";
  const today = getTodayDateStr(timezone);
  if (dateStr === today) return "Today";
  const yesterday = addDaysToDate(today, -1);
  if (dateStr === yesterday) return "Yesterday";
  const tomorrow = addDaysToDate(today, 1);
  if (dateStr === tomorrow) return "Tomorrow";
  return formatFriendlyDate(dateStr, { showWeekday: true, showYear: false });
}

/**
 * Shifts all matrix plan dates safely based on a new start date.
 */
export function shiftAllMatrixDates<T extends { weekNumber: number; startDate?: string; days: Record<DayOfWeek, any> }>(
  plans: T[],
  newStartDate: string
): T[] {
  return plans.map((wp) => {
    const weekStart = computeDateForDay(newStartDate, wp.weekNumber, "Monday");
    const newDays = { ...wp.days };
    for (const d of DAYS_OF_WEEK) {
      if (newDays[d]) {
        newDays[d] = {
          ...newDays[d],
          date: computeDateForDay(newStartDate, wp.weekNumber, d)
        };
      }
    }
    return {
      ...wp,
      startDate: weekStart,
      days: newDays
    };
  });
}
