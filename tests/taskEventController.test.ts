import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import * as taskEventController from "../src/controllers/taskEventController";
import * as taskEventRepo from "../src/repositories/taskEventRepository";

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

afterEach(() => {
  mock.restore();
});

describe("taskEventController.listTaskEvents", () => {
  test("returns events for a task", async () => {
    const events = [{ event_id: "evt-1", task_id: "task-1" }];
    const repoSpy = spyOn(taskEventRepo, "getTaskEventsByTaskId").mockResolvedValue(
      events as never,
    );

    const req = { params: { taskId: "task-1" } } as Request<{
      taskId: string;
    }>;
    const res = createMockResponse();

    await taskEventController.listTaskEvents(req, res);

    expect(repoSpy).toHaveBeenCalledWith("task-1");
    expect(res.statusCode).toBeUndefined();
    expect(res.body).toEqual({ success: true, data: events });
  });

  test("returns 500 when repository throws", async () => {
    spyOn(taskEventRepo, "getTaskEventsByTaskId").mockRejectedValue(
      new Error("db error"),
    );

    const req = { params: { taskId: "task-1" } } as Request<{
      taskId: string;
    }>;
    const res = createMockResponse();

    await taskEventController.listTaskEvents(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: "Failed to fetch events",
    });
  });
});

describe("taskEventController.createTaskEvent", () => {
  test("creates an event and returns 201", async () => {
    const payload = {
      task: { connect: { task_id: "task-1" } },
      type: "TASK_UPDATED",
      message: "Task updated",
    };
    const created = { event_id: "evt-1", ...payload };

    const repoSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      created as never,
    );

    const req = { body: payload } as Request;
    const res = createMockResponse();

    await taskEventController.createTaskEvent(req, res);

    expect(repoSpy).toHaveBeenCalledWith(payload);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: created });
  });

  test("returns 400 when create fails", async () => {
    spyOn(taskEventRepo, "createTaskEvent").mockRejectedValue(
      new Error("invalid payload"),
    );

    const req = { body: { type: "TASK_UPDATED" } } as Request;
    const res = createMockResponse();

    await taskEventController.createTaskEvent(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Failed to create event",
    });
  });
});
