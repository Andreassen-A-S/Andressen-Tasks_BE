import bcrypt from "bcrypt";
import { RecurrenceFrequency } from "../generated/prisma/client";
import type { Request, Response } from "express";

export const getIdFromUrl = (url: string): string | undefined => {
  return new URL(url).pathname.split("/").pop();
};

// Password hashing
const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Extracts a parameter from the request params.
 */
export function getParamId(req: Request, key: string = "id"): string | null {
  const raw = req.params[key];
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  return raw;
}

/**
 * Ensures the request has an authenticated user.
 */
export function requireUserId(req: Request, res: Response): string | null {
  const userId = req.user?.user_id;
  if (!userId) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return null;
  }
  return userId;
}

// Helpers for input validation template

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates days_of_week for weekly recurrence
 * @param daysOfWeek - Array of day numbers (0-6, where 0 = Sunday)
 * @returns ValidationResult
 */
export function validateDaysOfWeek(daysOfWeek: unknown): ValidationResult {
  // Check if it's an array
  if (!Array.isArray(daysOfWeek)) {
    return {
      isValid: false,
      error: "days_of_week must be an array",
    };
  }

  // Check if array is empty
  if (daysOfWeek.length === 0) {
    return {
      isValid: false,
      error: "days_of_week cannot be empty for weekly recurrence",
    };
  }

  // Check if all values are valid day numbers (0-6)
  const hasInvalidDay = daysOfWeek.some(
    (day) =>
      typeof day !== "number" || day < 0 || day > 6 || !Number.isInteger(day),
  );

  if (hasInvalidDay) {
    return {
      isValid: false,
      error:
        "days_of_week must contain only integers between 0 and 6 (0=Sunday, 6=Saturday)",
    };
  }

  // Check for duplicates
  const uniqueDays = new Set(daysOfWeek);
  if (uniqueDays.size !== daysOfWeek.length) {
    return {
      isValid: false,
      error: "days_of_week contains duplicate values",
    };
  }

  return { isValid: true };
}

/**
 * Validates day_of_month for monthly recurrence
 * @param dayOfMonth - Day of the month (1-31)
 * @returns ValidationResult
 */
export function validateDayOfMonth(dayOfMonth: unknown): ValidationResult {
  // Check if it's a number
  if (typeof dayOfMonth !== "number") {
    return {
      isValid: false,
      error: "day_of_month must be a number",
    };
  }

  // Check if it's an integer
  if (!Number.isInteger(dayOfMonth)) {
    return {
      isValid: false,
      error: "day_of_month must be an integer",
    };
  }

  // Check if it's in valid range (1-31)
  if (dayOfMonth < 1 || dayOfMonth > 31) {
    return {
      isValid: false,
      error: "day_of_month must be between 1 and 31",
    };
  }

  return { isValid: true };
}

/**
 * Validates start_date and end_date
 * @param startDate - Start date (string or Date)
 * @param endDate - Optional end date (string or Date)
 * @returns ValidationResult
 */
export function validateDateRange(
  startDate: unknown,
  endDate?: unknown,
): ValidationResult {
  // Validate start_date
  if (!startDate) {
    return {
      isValid: false,
      error: "start_date is required",
    };
  }

  let startDateObj: Date;
  try {
    startDateObj = new Date(startDate as string | Date);
    if (isNaN(startDateObj.getTime())) {
      return {
        isValid: false,
        error: "start_date is not a valid date",
      };
    }
  } catch {
    return {
      isValid: false,
      error: "start_date is not a valid date",
    };
  }

  // If end_date is not provided, validation passes
  if (!endDate) {
    return { isValid: true };
  }

  // Validate end_date
  let endDateObj: Date;
  try {
    endDateObj = new Date(endDate as string | Date);
    if (isNaN(endDateObj.getTime())) {
      return {
        isValid: false,
        error: "end_date is not a valid date",
      };
    }
  } catch {
    return {
      isValid: false,
      error: "end_date is not a valid date",
    };
  }

  // Check if end_date is after start_date
  if (endDateObj <= startDateObj) {
    return {
      isValid: false,
      error: "end_date must be after start_date",
    };
  }

  return { isValid: true };
}

/**
 * Validates interval for recurrence
 * @param interval - Recurrence interval (must be >= 1)
 * @returns ValidationResult
 */
export function validateInterval(interval: unknown): ValidationResult {
  // Check if it's a number
  if (typeof interval !== "number") {
    return {
      isValid: false,
      error: "interval must be a number",
    };
  }

  // Check if it's an integer
  if (!Number.isInteger(interval)) {
    return {
      isValid: false,
      error: "interval must be an integer",
    };
  }

  // Check if it's positive
  if (interval < 1) {
    return {
      isValid: false,
      error: "interval must be at least 1",
    };
  }

  return { isValid: true };
}

/**
 * Comprehensive validation for recurring template data
 * Combines all validation rules
 * @param data - Template data to validate
 * @returns ValidationResult
 */
export function validateRecurringTemplateData(data: {
  title?: unknown;
  frequency?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  interval?: unknown;
  days_of_week?: unknown;
  day_of_month?: unknown;
}): ValidationResult {
  // Check required fields
  if (
    !data.title ||
    typeof data.title !== "string" ||
    data.title.trim() === ""
  ) {
    return {
      isValid: false,
      error: "title is required and must be a non-empty string",
    };
  }

  if (!data.frequency) {
    return {
      isValid: false,
      error: "frequency is required",
    };
  }

  // Validate frequency is a valid enum value
  const validFrequencies = Object.values(RecurrenceFrequency);
  if (!validFrequencies.includes(data.frequency as RecurrenceFrequency)) {
    return {
      isValid: false,
      error: `frequency must be one of: ${validFrequencies.join(", ")}`,
    };
  }

  // Validate dates
  const dateValidation = validateDateRange(data.start_date, data.end_date);
  if (!dateValidation.isValid) {
    return dateValidation;
  }

  // Validate recurrence-specific requirements
  return validateRecurrenceRequirements(data.frequency as RecurrenceFrequency, {
    days_of_week: data.days_of_week,
    day_of_month: data.day_of_month,
    interval: data.interval,
  });
}

/**
 * Validates recurrence-specific requirements based on frequency
 * @param frequency - Recurrence frequency
 * @param data - Request body data
 * @returns ValidationResult
 */

export function validateRecurrenceRequirements(
  frequency: RecurrenceFrequency,
  data: {
    days_of_week?: unknown;
    day_of_month?: unknown;
    interval?: unknown;
  },
): ValidationResult {
  // Validate interval if provided (applies to all frequencies)
  if (data.interval !== undefined) {
    const intervalValidation = validateInterval(data.interval);
    if (!intervalValidation.isValid) {
      return intervalValidation;
    }
  }

  switch (frequency) {
    case RecurrenceFrequency.DAILY:
      // DAILY should NOT have days_of_week or day_of_month
      if (data.days_of_week !== undefined && data.days_of_week !== null) {
        return {
          isValid: false,
          error: "days_of_week should not be set for daily recurrence",
        };
      }
      if (data.day_of_month !== undefined && data.day_of_month !== null) {
        return {
          isValid: false,
          error: "day_of_month should not be set for daily recurrence",
        };
      }
      return { isValid: true };

    case RecurrenceFrequency.WEEKLY:
      // WEEKLY requires days_of_week
      if (!data.days_of_week) {
        return {
          isValid: false,
          error: "days_of_week is required for weekly recurrence",
        };
      }

      // Validate days_of_week
      const daysValidation = validateDaysOfWeek(data.days_of_week);
      if (!daysValidation.isValid) {
        return daysValidation;
      }

      // WEEKLY should NOT have day_of_month
      if (data.day_of_month !== undefined && data.day_of_month !== null) {
        return {
          isValid: false,
          error: "day_of_month should not be set for weekly recurrence",
        };
      }

      return { isValid: true };

    case RecurrenceFrequency.MONTHLY:
      // MONTHLY requires day_of_month
      if (!data.day_of_month) {
        return {
          isValid: false,
          error: "day_of_month is required for monthly recurrence",
        };
      }

      // Validate day_of_month
      const dayValidation = validateDayOfMonth(data.day_of_month);
      if (!dayValidation.isValid) {
        return dayValidation;
      }

      // MONTHLY should NOT have days_of_week
      if (data.days_of_week !== undefined && data.days_of_week !== null) {
        return {
          isValid: false,
          error: "days_of_week should not be set for monthly recurrence",
        };
      }

      return { isValid: true };

    case RecurrenceFrequency.YEARLY:
      // YEARLY should NOT have days_of_week or day_of_month
      if (data.days_of_week !== undefined && data.days_of_week !== null) {
        return {
          isValid: false,
          error: "days_of_week should not be set for yearly recurrence",
        };
      }
      if (data.day_of_month !== undefined && data.day_of_month !== null) {
        return {
          isValid: false,
          error: "day_of_month should not be set for yearly recurrence",
        };
      }
      return { isValid: true };

    default:
      return {
        isValid: false,
        error: `Unknown frequency: ${frequency}`,
      };
  }
}
