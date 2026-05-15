import { describe, expect, mock, spyOn, test, afterEach } from "bun:test";
import type { Request, Response } from "express";
import { RecurrenceFrequency, UserRole } from "../src/generated/prisma/client";
import { errorMiddleware } from "../src/middleware/errorMiddleware";

async function callController(
  fn: (req: Request, res: Response) => Promise<void>,
  req: Request,
  res: Response,
): Promise<void> {
  try {
    await (fn as any)(req, res);
  } catch (err) {
    errorMiddleware(err, req, res, () => {});
  }
}

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
        project_id: "p1",
      },
    });
    const res = createMockResponse();

    await callController(templateController.createTemplate, req, res);

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
        project_id: "p1",
      },
    });
    const res = createMockResponse();

    await callController(templateController.createTemplate, req, res);

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

    await callController(templateController.updateTemplate, req, res);

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

    await callController(templateController.updateTemplate, req, res);

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

    await callController(templateController.updateTemplate, req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "end_date must be after start_date",
    });
  });
});
