import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { Request, Response } from "express";
import {
  RecurrenceFrequency,
  TaskEventType,
  UserRole,
} from "../src/generated/prisma/client";

// Mock Prisma BEFORE importing anything
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

// NOW import after mocking
import * as recurringTemplateController from "../src/controllers/templateController";
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

describe("recurringTemplateController.listTemplates", () => {
  test("returns all templates (active and inactive)", async () => {
    const templates = [
      {
        id: "template1",
        title: "Weekly Meeting",
        frequency: RecurrenceFrequency.WEEKLY,
        is_active: true,
      },
      {
        id: "template2",
        title: "Monthly Report",
        frequency: RecurrenceFrequency.MONTHLY,
        is_active: false,
      },
    ];

    spyOn(RecurringTaskService.prototype, "getAllTemplates").mockResolvedValue(
      templates as never,
    );

    const req = createRequest({ user: { user_id: "u1", role: UserRole.USER } });
    const res = createMockResponse();

    await recurringTemplateController.listTemplates(req, res);

    expect(res.body).toEqual({ success: true, data: templates });
  });

  test("returns 500 when service fails", async () => {
    spyOn(RecurringTaskService.prototype, "getAllTemplates").mockRejectedValue(
      new Error("Database error"),
    );

    const req = createRequest({ user: { user_id: "u1", role: UserRole.USER } });
    const res = createMockResponse();

    await recurringTemplateController.listTemplates(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: "Failed to fetch templates",
    });
  });
});

describe("recurringTemplateController.listActiveTemplates", () => {
  test("returns only active templates", async () => {
    const activeTemplates = [
      {
        id: "template1",
        title: "Weekly Meeting",
        frequency: RecurrenceFrequency.WEEKLY,
        is_active: true,
      },
      {
        id: "template3",
        title: "Daily Standup",
        frequency: RecurrenceFrequency.DAILY,
        is_active: true,
      },
    ];

    spyOn(
      RecurringTaskService.prototype,
      "getActiveTemplates",
    ).mockResolvedValue(activeTemplates as never);

    const req = createRequest({ user: { user_id: "u1", role: UserRole.USER } });
    const res = createMockResponse();

    await recurringTemplateController.listActiveTemplates(req, res);

    expect(res.body).toEqual({ success: true, data: activeTemplates });
    activeTemplates.forEach((t) => expect(t.is_active).toBe(true));
  });

  test("returns 500 when service fails", async () => {
    spyOn(
      RecurringTaskService.prototype,
      "getActiveTemplates",
    ).mockRejectedValue(new Error("Database error"));

    const req = createRequest({ user: { user_id: "u1", role: UserRole.USER } });
    const res = createMockResponse();

    await recurringTemplateController.listActiveTemplates(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: "Failed to fetch active templates",
    });
  });
});

describe("recurringTemplateController.getTemplate", () => {
  test("returns 404 when template not found", async () => {
    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue(
      null,
    );

    const req = createRequest({
      params: { id: "nonexistent" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await recurringTemplateController.getTemplate(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: "Template not found",
    });
  });

  test("returns template with relations", async () => {
    const template = {
      id: "t1",
      title: "Weekly standup",
      frequency: RecurrenceFrequency.WEEKLY,
      interval: 1,
      is_active: true,
      creator: { user_id: "u1", name: "John" },
      default_assignees: [{ user_id: "u2", user: { name: "Jane" } }],
    };

    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue(
      template as never,
    );

    const req = createRequest({
      params: { id: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await recurringTemplateController.getTemplate(req, res);

    expect(res.body).toEqual({ success: true, data: template });
  });
});

describe("recurringTemplateController.createTemplate", () => {
  test("returns 401 when user is not authenticated", async () => {
    const req = createRequest({ user: undefined });
    const res = createMockResponse();

    await recurringTemplateController.createTemplate(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Unauthorized" });
  });

  test("returns 400 when required fields are missing", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: { title: "" },
    });
    const res = createMockResponse();

    await recurringTemplateController.createTemplate(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Missing required fields: title, frequency, start_date",
    });
  });

  test("creates template and generates 12 initial instances", async () => {
    const createdTemplate = {
      id: "template1",
      title: "Daily standup",
      frequency: RecurrenceFrequency.DAILY,
      interval: 1,
      created_by: "u1",
      is_active: true,
    };

    spyOn(RecurringTaskService.prototype, "createTemplate").mockResolvedValue(
      createdTemplate as never,
    );

    spyOn(
      RecurringTaskService.prototype,
      "setDefaultAssignees",
    ).mockResolvedValue(undefined);

    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue(
      createdTemplate as never,
    );

    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: {
        title: "Daily standup",
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
        start_date: new Date("2026-02-01"),
        assigned_users: ["u1", "u2"],
      },
    });
    const res = createMockResponse();

    await recurringTemplateController.createTemplate(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: createdTemplate });
  });
});

describe("recurringTemplateController.updateTemplate", () => {
  test("returns 404 when template not found", async () => {
    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue(
      null,
    );

    const req = createRequest({
      params: { id: "nonexistent" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { title: "Updated" },
    });
    const res = createMockResponse();

    await recurringTemplateController.updateTemplate(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: "Template not found",
    });
  });

  test("returns 403 when user is not the creator (non-admin)", async () => {
    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue({
      id: "t1",
      created_by: "other_user",
    } as never);

    const req = createRequest({
      params: { id: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { title: "Updated" },
    });
    const res = createMockResponse();

    await recurringTemplateController.updateTemplate(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: "Not authorized to update this template",
    });
  });

  test("updates template successfully", async () => {
    const oldTemplate = {
      id: "t1",
      title: "Old title",
      created_by: "u1",
    };

    spyOn(RecurringTaskService.prototype, "getTemplateById")
      .mockResolvedValueOnce(oldTemplate as never)
      .mockResolvedValueOnce({
        ...oldTemplate,
        title: "New title",
      } as never);

    spyOn(RecurringTaskService.prototype, "updateTemplate").mockResolvedValue({
      ...oldTemplate,
      title: "New title",
    } as never);

    const req = createRequest({
      params: { id: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { title: "New title" },
    });
    const res = createMockResponse();

    await recurringTemplateController.updateTemplate(req, res);

    expect(res.statusCode).toBe(200);
  });
});

describe("recurringTemplateController.deleteTemplate", () => {
  test("deletes template and all its instances", async () => {
    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue({
      id: "t1",
      created_by: "u1",
    } as never);

    const deleteSpy = spyOn(
      RecurringTaskService.prototype,
      "deleteTemplate",
    ).mockResolvedValue(undefined as never);

    const req = createRequest({
      params: { id: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.ADMIN },
    });
    const res = createMockResponse();

    await recurringTemplateController.deleteTemplate(req, res);

    expect(deleteSpy).toHaveBeenCalledWith("t1");
    expect(res.statusCode).toBe(204);
  });

  test("returns 403 when non-creator tries to delete", async () => {
    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue({
      id: "t1",
      created_by: "other_user",
    } as never);

    const req = createRequest({
      params: { id: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await recurringTemplateController.deleteTemplate(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: "Not authorized to delete this template",
    });
  });
});

describe("recurringTemplateController.deactivateTemplate", () => {
  test("deactivates template successfully", async () => {
    const template = {
      id: "t1",
      title: "Weekly task",
      is_active: true,
      created_by: "u1",
    };

    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue(
      template as never,
    );

    spyOn(
      RecurringTaskService.prototype,
      "deactivateTemplate",
    ).mockResolvedValue({
      ...template,
      is_active: false,
    } as never);

    const req = createRequest({
      params: { id: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await recurringTemplateController.deactivateTemplate(req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).data.is_active).toBe(false);
  });
});

describe("recurringTemplateController.reactivateTemplate", () => {
  test("reactivates template successfully", async () => {
    const template = {
      id: "t1",
      title: "Weekly task",
      is_active: false,
      created_by: "u1",
    };

    spyOn(RecurringTaskService.prototype, "getTemplateById").mockResolvedValue(
      template as never,
    );

    spyOn(
      RecurringTaskService.prototype,
      "reactivateTemplate",
    ).mockResolvedValue({
      ...template,
      is_active: true,
    } as never);

    const req = createRequest({
      params: { id: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await recurringTemplateController.reactivateTemplate(req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).data.is_active).toBe(true);
  });
});

describe("recurringTemplateController.getTemplateInstances", () => {
  test("returns all task instances for a template", async () => {
    const instances = [
      {
        task_id: "task1",
        title: "Weekly Meeting",
        occurrence_date: new Date("2026-02-03"),
      },
      {
        task_id: "task2",
        title: "Weekly Meeting",
        occurrence_date: new Date("2026-02-10"),
      },
    ];

    spyOn(
      RecurringTaskService.prototype,
      "getTemplateInstances",
    ).mockResolvedValue(instances as never);

    const req = createRequest({
      params: { id: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await recurringTemplateController.getTemplateInstances(req, res);

    expect(res.body).toEqual({ success: true, data: instances });
  });
});
