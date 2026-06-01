import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { TaskEventType, TaskStatus, TaskUnit } from "../src/generated/prisma/client";
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

const transactionMock = mock<(fn: (tx: any) => Promise<any>) => Promise<any>>();
mock.module("../src/db/prisma", () => ({
  prisma: { $transaction: transactionMock },
}));

import * as goalController from "../src/controllers/goalController";
import * as goalRepo from "../src/repositories/goalRepository";
import * as taskRepo from "../src/repositories/taskRepository";
import * as taskEventRepo from "../src/repositories/taskEventRepository";
import { TaskNotFoundError, TaskArchivedError } from "../src/errors/domainErrors";

type MockResponse = Response & { statusCode?: number; body?: unknown };

function createMockResponse(): MockResponse {
  const res: MockResponse = {} as MockResponse;
  res.status = mock((code: number) => { res.statusCode = code; return res; }) as unknown as Response["status"];
  res.json = mock((payload: unknown) => { res.body = payload; return res; }) as unknown as Response["json"];
  res.send = mock(() => res) as unknown as Response["send"];
  return res;
}

function createRequest(overrides: Record<string, any> = {}): Request {
  return {
    params: {},
    body: {},
    query: {},
    effectiveOrgId: null,
    user: { user_id: "u1", role: "ADMIN" },
    ...overrides,
  } as Request;
}

afterEach(() => {
  mock.restore();
  transactionMock.mockReset();
});

describe("goalController.setGoal", () => {
  test("returns 400 when taskId is missing", async () => {
    const req = createRequest({ params: {} });
    const res = createMockResponse();

    await callController(goalController.setGoal, req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Missing task ID" });
  });

  test("returns 400 when body fields are missing", async () => {
    const req = createRequest({
      params: { taskId: "t1" },
      body: {},
    });
    const res = createMockResponse();

    await callController(goalController.setGoal, req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "target_quantity and unit are required" });
  });

  test("returns 404 when task is outside effective org", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue(null);

    const req = createRequest({
      params: { taskId: "t-other-org" },
      body: { target_quantity: 10, unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await callController(goalController.setGoal, req, res);

    expect(res.statusCode).toBe(404);
  });

  test("returns 409 when task is archived", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", status: TaskStatus.ARCHIVED } as never);

    const req = createRequest({
      params: { taskId: "t1" },
      body: { target_quantity: 10, unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await callController(goalController.setGoal, req, res);

    expect(res.statusCode).toBe(409);
  });

  test("creates goal and emits TASK_GOAL_SET when no existing goal", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", status: TaskStatus.IN_PROGRESS } as never);
    spyOn(goalRepo, "getActiveGoal").mockResolvedValue(null);
    const goal = { goal_id: "g1", task_id: "t1", target_quantity: 10, unit: TaskUnit.METERS, current_quantity: 0 };
    spyOn(goalRepo, "createGoal").mockResolvedValue(goal as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({
      params: { taskId: "t1" },
      body: { target_quantity: 10, unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await callController(goalController.setGoal, req, res);

    expect(goalRepo.createGoal).toHaveBeenCalledWith(expect.anything(), "t1", { target_quantity: 10, unit: TaskUnit.METERS });
    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0]?.[1]?.type).toBe(TaskEventType.TASK_GOAL_SET);
    expect(res.body).toEqual({ success: true, data: goal });
  });

  test("soft-removes existing goal and emits REMOVED then SET when replacing", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", status: TaskStatus.IN_PROGRESS } as never);
    const existing = { goal_id: "g-old", task_id: "t1", target_quantity: 5, unit: TaskUnit.METERS };
    spyOn(goalRepo, "getActiveGoal").mockResolvedValue(existing as never);
    spyOn(goalRepo, "softRemoveGoal").mockResolvedValue({} as never);
    const newGoal = { goal_id: "g-new", task_id: "t1", target_quantity: 20, unit: TaskUnit.METERS, current_quantity: 0 };
    spyOn(goalRepo, "createGoal").mockResolvedValue(newGoal as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({
      params: { taskId: "t1" },
      body: { target_quantity: 20, unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await callController(goalController.setGoal, req, res);

    expect(goalRepo.softRemoveGoal).toHaveBeenCalledWith(expect.anything(), "g-old");
    expect(eventSpy).toHaveBeenCalledTimes(2);
    expect(eventSpy.mock.calls[0]?.[1]?.type).toBe(TaskEventType.TASK_GOAL_REMOVED);
    expect(eventSpy.mock.calls[1]?.[1]?.type).toBe(TaskEventType.TASK_GOAL_SET);
    expect(res.body).toEqual({ success: true, data: newGoal });
  });
});

describe("goalController.removeGoal", () => {
  test("returns 400 when taskId is missing", async () => {
    const req = createRequest({ params: {} });
    const res = createMockResponse();

    await callController(goalController.removeGoal, req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Missing task ID" });
  });

  test("returns 404 when task is outside effective org", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue(null);

    const req = createRequest({ params: { taskId: "t-other-org" } });
    const res = createMockResponse();

    await callController(goalController.removeGoal, req, res);

    expect(res.statusCode).toBe(404);
  });

  test("returns 404 when no active goal exists", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", status: TaskStatus.IN_PROGRESS } as never);
    spyOn(goalRepo, "getActiveGoal").mockResolvedValue(null);

    const req = createRequest({ params: { taskId: "t1" } });
    const res = createMockResponse();

    await callController(goalController.removeGoal, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "No active goal found" });
  });

  test("soft-removes goal and emits TASK_GOAL_REMOVED", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", status: TaskStatus.IN_PROGRESS } as never);
    const existing = { goal_id: "g1", task_id: "t1", target_quantity: 10, unit: TaskUnit.METERS };
    spyOn(goalRepo, "getActiveGoal").mockResolvedValue(existing as never);
    spyOn(goalRepo, "softRemoveGoal").mockResolvedValue({} as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({ params: { taskId: "t1" } });
    const res = createMockResponse();

    await callController(goalController.removeGoal, req, res);

    expect(goalRepo.softRemoveGoal).toHaveBeenCalledWith(expect.anything(), "g1");
    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0]?.[1]?.type).toBe(TaskEventType.TASK_GOAL_REMOVED);
    expect(res.body).toEqual({ success: true });
  });

  test("returns 409 when task is archived", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", status: TaskStatus.ARCHIVED } as never);

    const req = createRequest({ params: { taskId: "t1" } });
    const res = createMockResponse();

    await callController(goalController.removeGoal, req, res);

    expect(res.statusCode).toBe(409);
  });

  test("enforces org boundary — scoped user cannot remove goal on task in another org", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    const getTaskSpy = spyOn(taskRepo, "getTaskById").mockResolvedValue(null);

    const req = createRequest({
      effectiveOrgId: "org-a",
      params: { taskId: "t-org-b" },
    });
    const res = createMockResponse();

    await callController(goalController.removeGoal, req, res);

    expect(getTaskSpy).toHaveBeenCalledWith("t-org-b", "org-a");
    expect(res.statusCode).toBe(404);
  });
});
