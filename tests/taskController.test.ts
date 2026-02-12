import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { TaskEventType, TaskUnit } from "../src/generated/prisma/client";
import * as taskController from "../src/controllers/taskController";
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

  res.send = mock(() => res) as unknown as Response["send"];

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

describe("taskController.listTasks", () => {
  test("returns tasks", async () => {
    const tasks = [{ task_id: "t1" }];
    spyOn(taskRepo, "getAllTasks").mockResolvedValue(tasks as never);
    const req = createRequest();
    const res = createMockResponse();

    await taskController.listTasks(req, res);

    expect(res.body).toEqual({ success: true, data: tasks });
  });

  test("returns 500 when repository fails", async () => {
    spyOn(taskRepo, "getAllTasks").mockRejectedValue(new Error("db fail"));
    const req = createRequest();
    const res = createMockResponse();

    await taskController.listTasks(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: "Failed to fetch tasks",
    });
  });
});

describe("taskController.getTask", () => {
  test("returns 400 for invalid id", async () => {
    const repoSpy = spyOn(taskRepo, "getTaskById");
    const req = createRequest({ params: { id: " " } as Request["params"] });
    const res = createMockResponse();

    await taskController.getTask(req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Missing or invalid id",
    });
  });
});

describe("taskController.createTask", () => {
  test("returns 401 when user is missing", async () => {
    const repoSpy = spyOn(taskRepo, "createTaskWithAssignments");
    const req = createRequest({ user: undefined });
    const res = createMockResponse();

    await taskController.createTask(req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Unauthorized" });
  });

  test("sets created_by to authenticated user when missing", async () => {
    const repoSpy = spyOn(
      taskRepo,
      "createTaskWithAssignments",
    ).mockResolvedValue({
      task_id: "t1",
      title: "Task",
      created_by: "u1",
      assignments: [],
    } as any);

    // Mock the event repo to prevent real DB calls
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as any);

    const req = createRequest({
      user: { user_id: "u1" },
      body: { title: "Task" },
    });
    const res = createMockResponse();

    await taskController.createTask(req, res);

    expect(repoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: "u1", title: "Task" }),
    );
    expect(res.statusCode).toBe(201);
  });
  test("returns 400 when created_by does not match authenticated user", async () => {
    const repoSpy = spyOn(taskRepo, "createTaskWithAssignments");

    const req = createRequest({
      user: { user_id: "u1" },
      body: { title: "Task", created_by: "u2" },
    });
    const res = createMockResponse();

    await taskController.createTask(req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "created_by must match the authenticated user",
    });
  });

  test("creates task and logs task + assignment events", async () => {
    const task = {
      task_id: "t1",
      assignments: [
        { assignment_id: "a1", user_id: "u2" },
        { assignment_id: "a2", user_id: "u3" },
      ],
    };
    spyOn(taskRepo, "createTaskWithAssignments").mockResolvedValue(
      task as never,
    );
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      {} as never,
    );

    const req = createRequest({
      user: { user_id: "u1" },
      body: { created_by: "u1", title: "Task" },
    });
    const res = createMockResponse();

    await taskController.createTask(req, res);

    expect(eventSpy).toHaveBeenCalledTimes(3);
    expect(eventSpy.mock.calls[0]?.[0]?.type).toBe(TaskEventType.TASK_CREATED);
    expect(eventSpy.mock.calls[1]?.[0]?.type).toBe(
      TaskEventType.ASSIGNMENT_CREATED,
    );
    expect(eventSpy.mock.calls[2]?.[0]?.type).toBe(
      TaskEventType.ASSIGNMENT_CREATED,
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: task });
  });
});

describe("taskController.updateTask", () => {
  test("updates task via light path and logs TASK_UPDATED", async () => {
    const oldTask = { task_id: "t1", title: "old" };
    const updatedTask = { task_id: "t1", title: "new" };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTask").mockResolvedValue(updatedTask as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      {} as never,
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { title: "new" },
    });
    const res = createMockResponse();

    await taskController.updateTask(req, res);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0]?.[0]?.type).toBe(TaskEventType.TASK_UPDATED);
    expect(res.body).toEqual({ success: true, data: updatedTask });
  });

  test("updates task via heavy path and logs assignment diffs + TASK_UPDATED", async () => {
    const oldTask = {
      task_id: "t1",
      assignments: [
        { assignment_id: "a1", user_id: "u1" },
        { assignment_id: "a2", user_id: "u2" },
      ],
    };
    const updatedTask = {
      task_id: "t1",
      assignments: [
        { assignment_id: "a1", user_id: "u1" },
        { assignment_id: "a3", user_id: "u3" },
      ],
    };

    spyOn(taskRepo, "getTaskByIdWithAssignments").mockResolvedValue(
      oldTask as never,
    );
    spyOn(taskRepo, "updateTaskWithAssignments").mockResolvedValue(
      updatedTask as never,
    );
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      {} as never,
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { assigned_users: ["u1", "u3"] },
    });
    const res = createMockResponse();

    await taskController.updateTask(req, res);

    expect(eventSpy).toHaveBeenCalledTimes(3);
    expect(eventSpy.mock.calls[0]?.[0]?.type).toBe(
      TaskEventType.ASSIGNMENT_CREATED,
    );
    expect(eventSpy.mock.calls[1]?.[0]?.type).toBe(
      TaskEventType.ASSIGNMENT_DELETED,
    );
    expect(eventSpy.mock.calls[2]?.[0]?.type).toBe(TaskEventType.TASK_UPDATED);
    expect(res.body).toEqual({ success: true, data: updatedTask });
  });
});

describe("taskController.deleteTask", () => {
  test("deletes task and logs TASK_DELETED", async () => {
    const task = { task_id: "t1" };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(task as never);
    const deleteSpy = spyOn(taskRepo, "deleteTask").mockResolvedValue(
      undefined,
    );
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      {} as never,
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
    });
    const res = createMockResponse();

    await taskController.deleteTask(req, res);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0]?.[0]?.type).toBe(TaskEventType.TASK_DELETED);
    expect(deleteSpy).toHaveBeenCalledWith("t1");
    expect(res.statusCode).toBe(204);
  });
});

describe("taskController.upsertProgressLog", () => {
  test("returns 404 when assignment does not exist", async () => {
    spyOn(taskRepo, "upsertProgressLog").mockRejectedValue(
      new Error("Assignment not found"),
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { quantity_done: 1, note: "done", unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await taskController.upsertProgressLog(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Assignment not found" });
  });

  test("upserts progress and logs PROGRESS_LOGGED", async () => {
    const progressLog = {
      progress_id: "p1",
      quantity_done: 5,
      unit: TaskUnit.METERS,
    };
    spyOn(taskRepo, "upsertProgressLog").mockResolvedValue(
      progressLog as never,
    );
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      {} as never,
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { quantity_done: 5, note: "good", unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await taskController.upsertProgressLog(req, res);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0]?.[0]?.type).toBe(
      TaskEventType.PROGRESS_LOGGED,
    );
    expect(res.body).toEqual({ success: true, data: progressLog });
  });
});
