import { describe, expect, mock, spyOn, test, afterEach } from "bun:test";
import type { Request, Response } from "express";
import { RecurrenceFrequency, UserRole } from "../src/generated/prisma/client";

// Mock Prisma
const prismaMock = {
  recurringTaskTemplate: {
    findMany: mock(() => Promise.resolve([])),
    findUnique: mock(() => Promise.resolve(null)),
    create: mock(() => Promise.resolve({})),
    update: mock(() => Promise.resolve({})),
    delete: mock(() => Promise.resolve({})),
  },
  task: {
    findFirst: mock(() => Promise.resolve(null)),
    findMany: mock(() => Promise.resolve([])),
    count: mock(() => Promise.resolve(0)),
    create: mock(() => Promise.resolve({})),
    createMany: mock(() => Promise.resolve({ count: 0 })),
    deleteMany: mock(() => Promise.resolve({ count: 0 })),
  },
  taskEvent: {
    create: mock(() => Promise.resolve({})),
    createMany: mock(() => Promise.resolve({ count: 0 })),
  },
  recurringTaskTemplateAssignee: {
    findMany: mock(() => Promise.resolve([])),
    deleteMany: mock(() => Promise.resolve({ count: 0 })),
    createMany: mock(() => Promise.resolve({ count: 0 })),
  },
  taskAssignment: {
    create: mock(() => Promise.resolve({})),
    createMany: mock(() => Promise.resolve({ count: 0 })),
  },
  user: {
    findMany: mock(() => Promise.resolve([])),
  },
  $transaction: mock(async (fn: any) => await fn(prismaMock)),
};

mock.module("../src/db/prisma", () => ({
  prisma: prismaMock,
}));

import * as templateController from "../src/controllers/templateController";
import { RecurringTaskService } from "../src/services/recurringTaskService";

type MockResponse = Response & {
  statusCode?: number;
  body?: unknown;
};

function createMockResponse(): MockResponse {
  const res: MockResponse = {} as MockResponse;

  res.status = mock((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];

  res.json = mock((payload: unknown) => {
    res.body = payload;
    if (!res.statusCode) res.statusCode = 200;
    return res;
  }) as unknown as Response["json"];

  res.send = mock(() => {
    if (!res.statusCode) res.statusCode = 204;
    return res;
  }) as unknown as Response["send"];

  return res;
}

function createRequest(overrides: Record<string, any> = {}): Request {
  return {
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as Request;
}

afterEach(() => {
  mock.restore();
});

describe("templateController.createTemplate - Validation Tests", () => {
  test("returns 400 when days_of_week is empty for weekly recurrence", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Weekly Meeting",
        frequency: RecurrenceFrequency.WEEKLY,
        start_date: "2026-02-01",
        days_of_week: [], // Empty array
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "days_of_week cannot be empty for weekly recurrence",
    });
  });

  test("returns 400 when days_of_week contains invalid day numbers", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Weekly Meeting",
        frequency: RecurrenceFrequency.WEEKLY,
        start_date: "2026-02-01",
        days_of_week: [0, 1, 7], // 7 is invalid
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.stringContaining("between 0 and 6"),
    });
  });

  test("returns 400 when days_of_week is not an array", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Weekly Meeting",
        frequency: RecurrenceFrequency.WEEKLY,
        start_date: "2026-02-01",
        days_of_week: "1,2,3", // String instead of array
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "days_of_week must be an array",
    });
  });

  test("returns 400 when days_of_week is missing for weekly recurrence", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Weekly Meeting",
        frequency: RecurrenceFrequency.WEEKLY,
        start_date: "2026-02-01",
        // days_of_week is missing
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "days_of_week is required for weekly recurrence",
    });
  });

  test("returns 400 when day_of_month is missing for monthly recurrence", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Monthly Report",
        frequency: RecurrenceFrequency.MONTHLY,
        start_date: "2026-02-01",
        // day_of_month is missing
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "day_of_month is required for monthly recurrence",
    });
  });

  test("returns 400 when day_of_month is out of range", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Monthly Report",
        frequency: RecurrenceFrequency.MONTHLY,
        start_date: "2026-02-01",
        day_of_month: 32, // Invalid
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "day_of_month must be between 1 and 31",
    });
  });

  test("returns 400 when day_of_month is 0", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Monthly Report",
        frequency: RecurrenceFrequency.MONTHLY,
        start_date: "2026-02-01",
        day_of_month: 0,
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "day_of_month is required for monthly recurrence",
    });
  });

  test("returns 400 when start_date is invalid", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Daily Task",
        frequency: RecurrenceFrequency.DAILY,
        start_date: "not-a-date",
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "start_date is not a valid date",
    });
  });

  test("returns 400 when end_date is before start_date", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Daily Task",
        frequency: RecurrenceFrequency.DAILY,
        start_date: "2026-12-31",
        end_date: "2026-01-01", // Before start_date
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "end_date must be after start_date",
    });
  });

  test("returns 400 when end_date equals start_date", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Daily Task",
        frequency: RecurrenceFrequency.DAILY,
        start_date: "2026-02-01",
        end_date: "2026-02-01", // Same as start_date
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "end_date must be after start_date",
    });
  });

  test("returns 400 when interval is 0", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Daily Task",
        frequency: RecurrenceFrequency.DAILY,
        start_date: "2026-02-01",
        interval: 0, // Invalid
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "interval must be at least 1",
    });
  });

  test("returns 400 when interval is negative", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Daily Task",
        frequency: RecurrenceFrequency.DAILY,
        start_date: "2026-02-01",
        interval: -5,
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "interval must be at least 1",
    });
  });

  test("returns 400 when interval is not an integer", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Daily Task",
        frequency: RecurrenceFrequency.DAILY,
        start_date: "2026-02-01",
        interval: 1.5,
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "interval must be an integer",
    });
  });

  test("returns 400 when days_of_week is set for daily recurrence", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Daily Task",
        frequency: RecurrenceFrequency.DAILY,
        start_date: "2026-02-01",
        days_of_week: [1, 2, 3], // Should not be set for daily
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.stringContaining("should not be set for daily"),
    });
  });

  test("returns 400 when day_of_month is set for daily recurrence", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Daily Task",
        frequency: RecurrenceFrequency.DAILY,
        start_date: "2026-02-01",
        day_of_month: 15, // Should not be set for daily
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.stringContaining("should not be set for daily"),
    });
  });

  test("creates template successfully with valid weekly data", async () => {
    const template = {
      id: "t1",
      title: "Weekly Meeting",
      frequency: RecurrenceFrequency.WEEKLY,
      days_of_week: [1, 3, 5],
      is_active: true,
      created_by: "u1",
    };

    spyOn(RecurringTaskService.prototype, "createTemplate").mockResolvedValue(
      template as never,
    );
    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue(
      template as never,
    );

    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Weekly Meeting",
        frequency: RecurrenceFrequency.WEEKLY,
        start_date: "2026-02-01",
        days_of_week: [1, 3, 5],
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: template });
  });

  test("creates template successfully with valid monthly data", async () => {
    const template = {
      id: "t1",
      title: "Monthly Report",
      frequency: RecurrenceFrequency.MONTHLY,
      day_of_month: 15,
      is_active: true,
      created_by: "u1",
    };

    spyOn(RecurringTaskService.prototype, "createTemplate").mockResolvedValue(
      template as never,
    );
    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue(
      template as never,
    );

    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Monthly Report",
        frequency: RecurrenceFrequency.MONTHLY,
        start_date: "2026-02-01",
        day_of_month: 15,
      },
    });
    const res = createMockResponse();

    await templateController.createTemplate(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: template });
  });
});

describe("templateController.updateTemplate - Validation Tests", () => {
  test("returns 400 when updating to invalid days_of_week", async () => {
    const existing = {
      id: "t1",
      title: "Weekly Meeting",
      frequency: RecurrenceFrequency.WEEKLY,
      days_of_week: [1, 3, 5],
      created_by: "u1",
      start_date: new Date("2026-02-01"),
      interval: 1,
    };

    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue(
      existing as never,
    );

    const req = createRequest({
      params: { id: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        days_of_week: [7, 8], // Invalid
      },
    });
    const res = createMockResponse();

    await templateController.updateTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.stringContaining("between 0 and 6"),
    });
  });

  test("returns 400 when updating to invalid day_of_month", async () => {
    const existing = {
      id: "t1",
      title: "Monthly Report",
      frequency: RecurrenceFrequency.MONTHLY,
      day_of_month: 15,
      created_by: "u1",
      start_date: new Date("2026-02-01"),
      interval: 1,
    };

    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue(
      existing as never,
    );

    const req = createRequest({
      params: { id: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        day_of_month: 32, // Invalid
      },
    });
    const res = createMockResponse();

    await templateController.updateTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "day_of_month must be between 1 and 31",
    });
  });

  test("returns 400 when updating end_date to be before start_date", async () => {
    const existing = {
      id: "t1",
      title: "Daily Task",
      frequency: RecurrenceFrequency.DAILY,
      created_by: "u1",
      start_date: new Date("2026-02-01"),
      interval: 1,
    };

    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue(
      existing as never,
    );

    const req = createRequest({
      params: { id: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        end_date: "2026-01-01", // Before start_date
      },
    });
    const res = createMockResponse();

    await templateController.updateTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "end_date must be after start_date",
    });
  });
});
