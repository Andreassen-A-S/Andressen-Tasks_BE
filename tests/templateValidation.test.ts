import { describe, expect, test } from "bun:test";
import { RecurrenceFrequency } from "../src/generated/prisma/client";
import {
  validateDaysOfWeek,
  validateDayOfMonth,
  validateDateRange,
  validateInterval,
  validateRecurrenceRequirements,
  validateRecurringTemplateData,
} from "../src/helper/helpers";

describe("validateDaysOfWeek", () => {
  test("returns valid for correct array", () => {
    const result = validateDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("returns valid for partial week", () => {
    const result = validateDaysOfWeek([1, 3, 5]); // Mon, Wed, Fri
    expect(result.isValid).toBe(true);
  });

  test("returns invalid when not an array", () => {
    const result = validateDaysOfWeek("not an array");
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("days_of_week must be an array");
  });

  test("returns invalid for empty array", () => {
    const result = validateDaysOfWeek([]);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(
      "days_of_week cannot be empty for weekly recurrence",
    );
  });

  test("returns invalid for day less than 0", () => {
    const result = validateDaysOfWeek([-1, 1, 2]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("between 0 and 6");
  });

  test("returns invalid for day greater than 6", () => {
    const result = validateDaysOfWeek([1, 2, 7]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("between 0 and 6");
  });

  test("returns invalid for non-integer values", () => {
    const result = validateDaysOfWeek([1.5, 2, 3]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("integers between 0 and 6");
  });

  test("returns invalid for non-numeric values", () => {
    const result = validateDaysOfWeek([1, "2", 3]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("integers between 0 and 6");
  });

  test("returns invalid for duplicate days", () => {
    const result = validateDaysOfWeek([1, 2, 2, 3]);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("days_of_week contains duplicate values");
  });

  test("returns invalid for null", () => {
    const result = validateDaysOfWeek(null);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("days_of_week must be an array");
  });

  test("returns invalid for undefined", () => {
    const result = validateDaysOfWeek(undefined);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("days_of_week must be an array");
  });
});

describe("validateDayOfMonth", () => {
  test("returns valid for day 1", () => {
    const result = validateDayOfMonth(1);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("returns valid for day 15", () => {
    const result = validateDayOfMonth(15);
    expect(result.isValid).toBe(true);
  });

  test("returns valid for day 31", () => {
    const result = validateDayOfMonth(31);
    expect(result.isValid).toBe(true);
  });

  test("returns invalid for day 0", () => {
    const result = validateDayOfMonth(0);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("day_of_month must be between 1 and 31");
  });

  test("returns invalid for day 32", () => {
    const result = validateDayOfMonth(32);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("day_of_month must be between 1 and 31");
  });

  test("returns invalid for negative day", () => {
    const result = validateDayOfMonth(-5);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("day_of_month must be between 1 and 31");
  });

  test("returns invalid for non-integer", () => {
    const result = validateDayOfMonth(15.5);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("day_of_month must be an integer");
  });

  test("returns invalid for string", () => {
    const result = validateDayOfMonth("15");
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("day_of_month must be a number");
  });

  test("returns invalid for null", () => {
    const result = validateDayOfMonth(null);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("day_of_month must be a number");
  });

  test("returns invalid for undefined", () => {
    const result = validateDayOfMonth(undefined);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("day_of_month must be a number");
  });
});

describe("validateDateRange", () => {
  test("returns valid for valid start_date without end_date", () => {
    const result = validateDateRange("2026-02-01");
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("returns valid for Date object", () => {
    const result = validateDateRange(new Date("2026-02-01"));
    expect(result.isValid).toBe(true);
  });

  test("returns valid when end_date is after start_date", () => {
    const result = validateDateRange("2026-02-01", "2026-12-31");
    expect(result.isValid).toBe(true);
  });

  test("returns invalid when start_date is missing", () => {
    const result = validateDateRange(null);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("start_date is required");
  });

  test("returns invalid when start_date is undefined", () => {
    const result = validateDateRange(undefined);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("start_date is required");
  });

  test("returns invalid for invalid start_date string", () => {
    const result = validateDateRange("not-a-date");
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("start_date is not a valid date");
  });

  test("returns invalid for invalid end_date string", () => {
    const result = validateDateRange("2026-02-01", "invalid-date");
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("end_date is not a valid date");
  });

  test("returns invalid when end_date equals start_date", () => {
    const result = validateDateRange("2026-02-01", "2026-02-01");
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("end_date must be after start_date");
  });

  test("returns invalid when end_date is before start_date", () => {
    const result = validateDateRange("2026-12-31", "2026-02-01");
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("end_date must be after start_date");
  });

  test("handles Date objects correctly", () => {
    const start = new Date("2026-02-01");
    const end = new Date("2026-12-31");
    const result = validateDateRange(start, end);
    expect(result.isValid).toBe(true);
  });

  test("returns invalid for Date objects when end is before start", () => {
    const start = new Date("2026-12-31");
    const end = new Date("2026-02-01");
    const result = validateDateRange(start, end);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("end_date must be after start_date");
  });
});

describe("validateInterval", () => {
  test("returns valid for interval 1", () => {
    const result = validateInterval(1);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("returns valid for interval 5", () => {
    const result = validateInterval(5);
    expect(result.isValid).toBe(true);
  });

  test("returns valid for large interval", () => {
    const result = validateInterval(100);
    expect(result.isValid).toBe(true);
  });

  test("returns invalid for interval 0", () => {
    const result = validateInterval(0);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("interval must be at least 1");
  });

  test("returns invalid for negative interval", () => {
    const result = validateInterval(-1);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("interval must be at least 1");
  });

  test("returns invalid for non-integer", () => {
    const result = validateInterval(1.5);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("interval must be an integer");
  });

  test("returns invalid for string", () => {
    const result = validateInterval("2");
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("interval must be a number");
  });

  test("returns invalid for null", () => {
    const result = validateInterval(null);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("interval must be a number");
  });

  test("returns invalid for undefined", () => {
    const result = validateInterval(undefined);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("interval must be a number");
  });
});

describe("validateRecurrenceRequirements", () => {
  describe("WEEKLY frequency", () => {
    test("returns valid with correct days_of_week", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.WEEKLY,
        {
          days_of_week: [1, 3, 5],
        },
      );
      expect(result.isValid).toBe(true);
    });

    test("returns invalid when days_of_week is missing", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.WEEKLY,
        {},
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        "days_of_week is required for weekly recurrence",
      );
    });

    test("returns invalid with invalid days_of_week", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.WEEKLY,
        {
          days_of_week: [7, 8],
        },
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("between 0 and 6");
    });

    test("validates interval when provided", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.WEEKLY,
        {
          days_of_week: [1, 3, 5],
          interval: 2,
        },
      );
      expect(result.isValid).toBe(true);
    });

    test("returns invalid with bad interval", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.WEEKLY,
        {
          days_of_week: [1, 3, 5],
          interval: 0,
        },
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("interval must be at least 1");
    });
  });

  describe("MONTHLY frequency", () => {
    test("returns valid with correct day_of_month", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.MONTHLY,
        {
          day_of_month: 15,
        },
      );
      expect(result.isValid).toBe(true);
    });

    test("returns invalid when day_of_month is missing", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.MONTHLY,
        {},
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        "day_of_month is required for monthly recurrence",
      );
    });

    test("returns invalid with invalid day_of_month", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.MONTHLY,
        {
          day_of_month: 32,
        },
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("day_of_month must be between 1 and 31");
    });

    test("validates interval when provided", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.MONTHLY,
        {
          day_of_month: 15,
          interval: 3,
        },
      );
      expect(result.isValid).toBe(true);
    });
  });

  describe("DAILY frequency", () => {
    test("returns valid without additional fields", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.DAILY,
        {},
      );
      expect(result.isValid).toBe(true);
    });

    test("returns valid with interval", () => {
      const result = validateRecurrenceRequirements(RecurrenceFrequency.DAILY, {
        interval: 2,
      });
      expect(result.isValid).toBe(true);
    });

    test("returns invalid when days_of_week is set", () => {
      const result = validateRecurrenceRequirements(RecurrenceFrequency.DAILY, {
        days_of_week: [1, 2, 3],
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("should not be set for daily");
    });

    test("returns invalid when day_of_month is set", () => {
      const result = validateRecurrenceRequirements(RecurrenceFrequency.DAILY, {
        day_of_month: 15,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("should not be set for daily");
    });
  });

  describe("YEARLY frequency", () => {
    test("returns valid without additional fields", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.YEARLY,
        {},
      );
      expect(result.isValid).toBe(true);
    });

    test("returns invalid when days_of_week is set", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.YEARLY,
        {
          days_of_week: [1],
        },
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("should not be set for yearly");
    });

    test("returns invalid when day_of_month is set", () => {
      const result = validateRecurrenceRequirements(
        RecurrenceFrequency.YEARLY,
        {
          day_of_month: 15,
        },
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("should not be set for yearly");
    });
  });
});

describe("validateRecurringTemplateData", () => {
  const validBaseData = {
    title: "Weekly Standup",
    frequency: RecurrenceFrequency.WEEKLY,
    start_date: "2026-02-01",
    days_of_week: [1, 3, 5],
  };

  test("returns valid for complete weekly template", () => {
    const result = validateRecurringTemplateData(validBaseData);
    expect(result.isValid).toBe(true);
  });

  test("returns invalid when title is missing", () => {
    const result = validateRecurringTemplateData({
      ...validBaseData,
      title: undefined,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("title is required");
  });

  test("returns invalid when title is empty string", () => {
    const result = validateRecurringTemplateData({
      ...validBaseData,
      title: "   ",
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("title is required");
  });

  test("returns invalid when title is not a string", () => {
    const result = validateRecurringTemplateData({
      ...validBaseData,
      title: 123,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("title is required");
  });

  test("returns invalid when frequency is missing", () => {
    const result = validateRecurringTemplateData({
      ...validBaseData,
      frequency: undefined,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("frequency is required");
  });

  test("returns invalid for unknown frequency", () => {
    const result = validateRecurringTemplateData({
      ...validBaseData,
      frequency: "HOURLY" as any,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("frequency must be one of");
  });

  test("validates date range", () => {
    const result = validateRecurringTemplateData({
      ...validBaseData,
      start_date: "2026-12-31",
      end_date: "2026-01-01",
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("end_date must be after start_date");
  });

  test("returns valid for daily template", () => {
    const result = validateRecurringTemplateData({
      title: "Daily Task",
      frequency: RecurrenceFrequency.DAILY,
      start_date: "2026-02-01",
    });
    expect(result.isValid).toBe(true);
  });

  test("returns valid for monthly template", () => {
    const result = validateRecurringTemplateData({
      title: "Monthly Report",
      frequency: RecurrenceFrequency.MONTHLY,
      start_date: "2026-02-01",
      day_of_month: 15,
    });
    expect(result.isValid).toBe(true);
  });

  test("returns valid for yearly template", () => {
    const result = validateRecurringTemplateData({
      title: "Annual Review",
      frequency: RecurrenceFrequency.YEARLY,
      start_date: "2026-02-01",
    });
    expect(result.isValid).toBe(true);
  });

  test("combines all validation errors properly", () => {
    const result = validateRecurringTemplateData({
      title: "Test",
      frequency: RecurrenceFrequency.WEEKLY,
      start_date: "2026-02-01",
      days_of_week: [7, 8, 9], // Invalid days
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("between 0 and 6");
  });

  // --- Additional tests for frequency changes and field requirements ---

  describe("frequency change validation", () => {
    test("WEEKLY: valid with days_of_week", () => {
      const result = validateRecurringTemplateData({
        title: "Weekly Task",
        frequency: RecurrenceFrequency.WEEKLY,
        start_date: "2026-02-01",
        days_of_week: [1, 3, 5],
      });
      expect(result.isValid).toBe(true);
    });

    test("MONTHLY: valid with day_of_month", () => {
      const result = validateRecurringTemplateData({
        title: "Monthly Task",
        frequency: RecurrenceFrequency.MONTHLY,
        start_date: "2026-02-01",
        day_of_month: 10,
      });
      expect(result.isValid).toBe(true);
    });

    test("DAILY: valid without frequency-specific fields", () => {
      const result = validateRecurringTemplateData({
        title: "Daily Task",
        frequency: RecurrenceFrequency.DAILY,
        start_date: "2026-02-01",
      });
      expect(result.isValid).toBe(true);
    });

    test("YEARLY: valid without frequency-specific fields", () => {
      const result = validateRecurringTemplateData({
        title: "Yearly Task",
        frequency: RecurrenceFrequency.YEARLY,
        start_date: "2026-02-01",
      });
      expect(result.isValid).toBe(true);
    });

    test("DAILY: rejects days_of_week", () => {
      const result = validateRecurringTemplateData({
        title: "Daily Task",
        frequency: RecurrenceFrequency.DAILY,
        start_date: "2026-02-01",
        days_of_week: [1, 3, 5], // ← Should not be here
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("should not be set for daily");
    });

    test("DAILY: rejects day_of_month", () => {
      const result = validateRecurringTemplateData({
        title: "Daily Task",
        frequency: RecurrenceFrequency.DAILY,
        start_date: "2026-02-01",
        day_of_month: 15, // ← Should not be here
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("should not be set for daily");
    });

    test("MONTHLY: rejects days_of_week", () => {
      const result = validateRecurringTemplateData({
        title: "Monthly Task",
        frequency: RecurrenceFrequency.MONTHLY,
        start_date: "2026-02-01",
        day_of_month: 15,
        days_of_week: [1, 3, 5], // ← Should not be here
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("should not be set for monthly");
    });

    test("WEEKLY: rejects day_of_month", () => {
      const result = validateRecurringTemplateData({
        title: "Weekly Task",
        frequency: RecurrenceFrequency.WEEKLY,
        start_date: "2026-02-01",
        days_of_week: [1, 3, 5],
        day_of_month: 15, // ← Should not be here
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("should not be set for weekly");
    });

    test("WEEKLY: requires days_of_week", () => {
      const result = validateRecurringTemplateData({
        title: "Weekly Task",
        frequency: RecurrenceFrequency.WEEKLY,
        start_date: "2026-02-01",
        // Missing days_of_week
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("days_of_week is required for weekly");
    });

    test("MONTHLY: requires day_of_month", () => {
      const result = validateRecurringTemplateData({
        title: "Monthly Task",
        frequency: RecurrenceFrequency.MONTHLY,
        start_date: "2026-02-01",
        // Missing day_of_month
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("day_of_month is required for monthly");
    });

    test("YEARLY: rejects days_of_week", () => {
      const result = validateRecurringTemplateData({
        title: "Yearly Task",
        frequency: RecurrenceFrequency.YEARLY,
        start_date: "2026-02-01",
        days_of_week: [1], // ← Should not be here
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("should not be set for yearly");
    });

    test("YEARLY: rejects day_of_month", () => {
      const result = validateRecurringTemplateData({
        title: "Yearly Task",
        frequency: RecurrenceFrequency.YEARLY,
        start_date: "2026-02-01",
        day_of_month: 15, // ← Should not be here
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("should not be set for yearly");
    });
  });
});
