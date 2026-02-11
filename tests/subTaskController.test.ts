import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { TaskEventType } from "../src/generated/prisma/client";
import * as subTaskController from "../src/controllers/subTaskController";
import * as taskEventRepo from "../src/repositories/taskEventRepository";
import * as taskRepo from "../src/repositories/taskRepository";

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
    return res;
  }) as unknown as Response["json"];

  return res;
}

function createRequest(overrides: Record<string, any> = {}): Request {
  return {
    params: {},
    body: {},
    ...overrides,
  } as Request;
}

afterEach(() => {
  mock.restore();
});

describe("subTaskController.createSubtask", () => {
  test("returns 400 when parent_task_id is missing", async () => {
    const req = createRequest({ body: { title: "subtask" } });
    const res = createMockResponse();

    await subTaskController.createSubtask(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "parent_task_id is required",
    });
  });

  test("returns 404 when parent task does not exist", async () => {
    spyOn(taskRepo, "getTaskById").mockResolvedValue(null);
    const req = createRequest({ body: { parent_task_id: "p1", title: "sub" } });
    const res = createMockResponse();

    await subTaskController.createSubtask(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: "Parent task not found",
    });
  });

  test("creates subtask and logs parent/subtask events", async () => {
    spyOn(taskRepo, "getTaskById").mockResolvedValue({
      task_id: "p1",
    } as never);
    const subtask = { task_id: "s1", parent_task_id: "p1" };
    spyOn(taskRepo, "createTaskWithAssignments").mockResolvedValue(
      subtask as never,
    );
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      {} as never,
    );

    const req = createRequest({
      user: { user_id: "u1" },
      body: { parent_task_id: "p1", title: "subtask" },
    });
    const res = createMockResponse();

    await subTaskController.createSubtask(req, res);

    expect(eventSpy).toHaveBeenCalledTimes(2);
    expect(eventSpy.mock.calls[0]?.[0]?.type).toBe(TaskEventType.SUBTASK_ADDED);
    expect(eventSpy.mock.calls[1]?.[0]?.type).toBe(TaskEventType.TASK_CREATED);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: subtask });
  });
});
