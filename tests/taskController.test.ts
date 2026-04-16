import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import {
  TaskEventType,
  TaskPriority,
  TaskStatus,
  TaskUnit,
} from "../src/generated/prisma/client";
import * as taskController from "../src/controllers/taskController";
import * as taskEventRepo from "../src/repositories/taskEventRepository";
import * as taskRepo from "../src/repositories/taskRepository";
import * as userRepo from "../src/repositories/userRepository";
import {
  AssignmentNotFoundError,
  TaskAlreadyDoneError,
  TaskNotFoundError,
  TaskNotProgressableError,
} from "../src/repositories/taskRepository";

const sendPushNotificationMock = mock<(...args: any[]) => Promise<void>>();

mock.module("../src/services/notificationService", () => ({
  sendPushNotification: sendPushNotificationMock,
}));

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
  sendPushNotificationMock.mockReset();
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
      body: { title: "Task", project_id: "p1" },
    });
    const res = createMockResponse();

    await taskController.createTask(req, res);

    expect(repoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: "u1", title: "Task" }),
    );
    expect(res.statusCode).toBe(201);
  });
  test("returns 400 when project_id is missing", async () => {
    const repoSpy = spyOn(taskRepo, "createTaskWithAssignments");

    const req = createRequest({
      user: { user_id: "u1" },
      body: { title: "Task", created_by: "u1" },
    });
    const res = createMockResponse();

    await taskController.createTask(req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "project_id is required" });
  });

  test("returns 400 when project_id is blank", async () => {
    const repoSpy = spyOn(taskRepo, "createTaskWithAssignments");

    const req = createRequest({
      user: { user_id: "u1" },
      body: { title: "Task", created_by: "u1", project_id: "   " },
    });
    const res = createMockResponse();

    await taskController.createTask(req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "project_id is required" });
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
    spyOn(userRepo, "getPushTokensForUsers").mockResolvedValue(new Map());
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      {} as never,
    );

    const req = createRequest({
      user: { user_id: "u1" },
      body: { created_by: "u1", title: "Task", project_id: "p1" },
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
  test("updates task and logs TASK_UPDATED", async () => {
    const oldTask = { task_id: "t1", title: "old", assigned_users: ["u1"], project: { name: "P1", color: null } };
    const updatedTask = { task_id: "t1", title: "new", project: { name: "P1", color: null }, assignments: [{ assignment_id: "a1", user_id: "u1" }] };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTask").mockResolvedValue(updatedTask as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { title: "new" },
    });
    const res = createMockResponse();

    await taskController.updateTask(req, res);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0]?.[0]?.type).toBe(TaskEventType.TASK_UPDATED);
    expect(res.body).toEqual({ success: true, data: { task_id: "t1", title: "new", project: { name: "P1", color: null }, assigned_users: ["u1"] } });
  });

  test("returns 404 when updateTask throws TaskNotFoundError", async () => {
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1" } as never);
    spyOn(taskRepo, "updateTask").mockRejectedValue(new TaskNotFoundError("t1"));

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { title: "new" },
    });
    const res = createMockResponse();

    await taskController.updateTask(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found: t1" });
  });

  test("returns 400 when updateTask throws TaskAlreadyDoneError", async () => {
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1" } as never);
    spyOn(taskRepo, "updateTask").mockRejectedValue(new TaskAlreadyDoneError());

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { status: TaskStatus.DONE },
    });
    const res = createMockResponse();

    await taskController.updateTask(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Task is already marked as done and cannot be set to done again.",
    });
  });

  test("updates assignments and logs assignment diffs + TASK_UPDATED", async () => {
    const oldTask = { task_id: "t1", assigned_users: ["u1", "u2"] };
    const updatedTask = {
      task_id: "t1",
      project: { name: "P1", color: null },
      assignments: [
        { assignment_id: "a1", user_id: "u1" },
        { assignment_id: "a3", user_id: "u3" },
      ],
    };

    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTask").mockResolvedValue(updatedTask as never);
    spyOn(userRepo, "getPushTokensForUsers").mockResolvedValue(new Map());
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { assigned_users: ["u1", "u3"] },
    });
    const res = createMockResponse();

    await taskController.updateTask(req, res);

    expect(eventSpy).toHaveBeenCalledTimes(3);
    expect(eventSpy.mock.calls[0]?.[0]?.type).toBe(TaskEventType.ASSIGNMENT_CREATED);
    expect(eventSpy.mock.calls[1]?.[0]?.type).toBe(TaskEventType.ASSIGNMENT_DELETED);
    expect(eventSpy.mock.calls[2]?.[0]?.type).toBe(TaskEventType.TASK_UPDATED);
    expect(res.body).toEqual({
      success: true,
      data: { task_id: "t1", project: { name: "P1", color: null }, assigned_users: ["u1", "u3"] },
    });
  });

  test("returns 404 when updateTask throws TaskNotFoundError (with assignments)", async () => {
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", assigned_users: [] } as never);
    spyOn(taskRepo, "updateTask").mockRejectedValue(new TaskNotFoundError("t1"));

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { assigned_users: ["u1"] },
    });
    const res = createMockResponse();

    await taskController.updateTask(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found: t1" });
  });

  test("returns 400 when updateTask throws TaskAlreadyDoneError (with assignments)", async () => {
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", assigned_users: [] } as never);
    spyOn(taskRepo, "updateTask").mockRejectedValue(new TaskAlreadyDoneError());

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { assigned_users: ["u1"], status: TaskStatus.DONE },
    });
    const res = createMockResponse();

    await taskController.updateTask(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Task is already marked as done and cannot be set to done again.",
    });
  });

  test("notifies admins when status transitions to DONE", async () => {
    const oldTask = { task_id: "t1", title: "My Task", status: TaskStatus.IN_PROGRESS, assigned_users: [] };
    const updatedTask = { task_id: "t1", title: "My Task", status: TaskStatus.DONE, assignments: [] };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTask").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([
      { user_id: "a1", push_token: "token-a1" },
    ]);
    sendPushNotificationMock.mockResolvedValue(undefined);

    await taskController.updateTask(
      createRequest({
        user: { user_id: "u1" },
        params: { id: "t1" } as Request["params"],
        body: { status: TaskStatus.DONE },
      }),
      createMockResponse(),
    );

    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      "token-a1",
      "Opgave afsluttet",
      "My Task",
      { taskId: "t1" },
      "a1",
    );
  });

  test("does not notify admins when status does not change to DONE", async () => {
    const oldTask = { task_id: "t1", title: "My Task", status: TaskStatus.PENDING, assigned_users: [] };
    const updatedTask = { task_id: "t1", title: "My Task", status: TaskStatus.IN_PROGRESS, assignments: [] };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTask").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    const adminSpy = spyOn(userRepo, "getAdminPushTokens");

    await taskController.updateTask(
      createRequest({
        user: { user_id: "u1" },
        params: { id: "t1" } as Request["params"],
        body: { status: TaskStatus.IN_PROGRESS },
      }),
      createMockResponse(),
    );

    expect(adminSpy).not.toHaveBeenCalled();
    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });

  test("notifies assignees when priority changes to HIGH on an active task", async () => {
    const pastDate = new Date(Date.now() - 86_400_000); // yesterday
    const oldTask = { task_id: "t1", title: "My Task", priority: TaskPriority.MEDIUM, assigned_users: ["u2"] };
    const updatedTask = {
      task_id: "t1",
      title: "My Task",
      priority: TaskPriority.HIGH,
      status: TaskStatus.IN_PROGRESS,
      start_date: pastDate,
      assignments: [{ assignment_id: "a1", user_id: "u2" }],
      project: { name: "P1", color: null },
    };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTask").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getPushTokensForUsers").mockResolvedValue(
      new Map([["u2", "token-u2"]]),
    );
    sendPushNotificationMock.mockResolvedValue(undefined);

    await taskController.updateTask(
      createRequest({
        user: { user_id: "u1" },
        params: { id: "t1" } as Request["params"],
        body: { priority: TaskPriority.HIGH },
      }),
      createMockResponse(),
    );

    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      "token-u2",
      "Prioritet ændret",
      "My Task – prioritet ændret til høj",
      { taskId: "t1" },
      "u2",
    );
  });

  test("does not notify when priority changes to HIGH but task has not started yet", async () => {
    const futureDate = new Date(Date.now() + 86_400_000); // tomorrow
    const oldTask = { task_id: "t1", priority: TaskPriority.LOW, assigned_users: ["u2"] };
    const updatedTask = {
      task_id: "t1",
      title: "My Task",
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      start_date: futureDate,
      assignments: [{ assignment_id: "a1", user_id: "u2" }],
      project: { name: "P1", color: null },
    };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTask").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    await taskController.updateTask(
      createRequest({
        user: { user_id: "u1" },
        params: { id: "t1" } as Request["params"],
        body: { priority: TaskPriority.HIGH },
      }),
      createMockResponse(),
    );

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });

  test("does not notify when priority changes to HIGH but task is in a terminal status", async () => {
    const pastDate = new Date(Date.now() - 86_400_000);
    const oldTask = { task_id: "t1", priority: TaskPriority.LOW, assigned_users: ["u2"] };
    const updatedTask = {
      task_id: "t1",
      title: "My Task",
      priority: TaskPriority.HIGH,
      status: TaskStatus.DONE,
      start_date: pastDate,
      assignments: [{ assignment_id: "a1", user_id: "u2" }],
      project: { name: "P1", color: null },
    };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTask").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([]);

    await taskController.updateTask(
      createRequest({
        user: { user_id: "u1" },
        params: { id: "t1" } as Request["params"],
        body: { priority: TaskPriority.HIGH },
      }),
      createMockResponse(),
    );

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });

  test("does not notify when priority was already HIGH", async () => {
    const pastDate = new Date(Date.now() - 86_400_000);
    const oldTask = { task_id: "t1", priority: TaskPriority.HIGH, assigned_users: ["u2"] };
    const updatedTask = {
      task_id: "t1",
      title: "My Task",
      priority: TaskPriority.HIGH,
      status: TaskStatus.IN_PROGRESS,
      start_date: pastDate,
      assignments: [{ assignment_id: "a1", user_id: "u2" }],
      project: { name: "P1", color: null },
    };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTask").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    await taskController.updateTask(
      createRequest({
        user: { user_id: "u1" },
        params: { id: "t1" } as Request["params"],
        body: { priority: TaskPriority.HIGH },
      }),
      createMockResponse(),
    );

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });

  test("notifies admins when status transitions to DONE with assignment update", async () => {
    const oldTask = { task_id: "t1", title: "My Task", status: TaskStatus.IN_PROGRESS, assigned_users: ["u1"] };
    const updatedTask = {
      task_id: "t1",
      title: "My Task",
      status: TaskStatus.DONE,
      assignments: [{ assignment_id: "a1", user_id: "u1" }],
    };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTask").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getPushTokensForUsers").mockResolvedValue(new Map());
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([
      { user_id: "a1", push_token: "token-a1" },
    ]);
    sendPushNotificationMock.mockResolvedValue(undefined);

    await taskController.updateTask(
      createRequest({
        user: { user_id: "u1" },
        params: { id: "t1" } as Request["params"],
        body: { assigned_users: ["u1"], status: TaskStatus.DONE },
      }),
      createMockResponse(),
    );

    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      "token-a1",
      "Opgave afsluttet",
      "My Task",
      { taskId: "t1" },
      "a1",
    );
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
  test("returns 404 when task does not exist", async () => {
    spyOn(taskRepo, "upsertProgressLog").mockRejectedValue(
      new TaskNotFoundError("t1"),
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { quantity_done: 1, unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await taskController.upsertProgressLog(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found: t1" });
  });

  test("returns 400 when task is not progressable", async () => {
    spyOn(taskRepo, "upsertProgressLog").mockRejectedValue(
      new TaskNotProgressableError(TaskStatus.DONE),
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { quantity_done: 1, unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await taskController.upsertProgressLog(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Cannot log progress on tasks with status: DONE",
    });
  });

  test("returns 404 when assignment does not exist", async () => {
    spyOn(taskRepo, "upsertProgressLog").mockRejectedValue(
      new AssignmentNotFoundError(),
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { quantity_done: 1, note: "done", unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await taskController.upsertProgressLog(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: "Assignment not found for this task and user.",
    });
  });

  test("upserts progress and logs PROGRESS_LOGGED", async () => {
    const progressLog = {
      progress_id: "p1",
      quantity_done: 5,
      unit: TaskUnit.METERS,
    };

    const updatedTask = {
      task_id: "t1",
      title: "My Task",
      current_quantity: 5,
      status: TaskStatus.IN_PROGRESS,
    };

    spyOn(taskRepo, "upsertProgressLog").mockResolvedValue({
      progressLog,
      updatedTask,
    } as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([]);

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { quantity_done: 5, note: "good", unit: TaskUnit.METERS },
    });

    const res = createMockResponse();

    await taskController.upsertProgressLog(req, res);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0]?.[0]?.type).toBe(TaskEventType.PROGRESS_LOGGED);
    expect(res.body).toEqual({
      success: true,
      data: {
        progressLog,
        task: {
          current_quantity: 5,
          status: TaskStatus.IN_PROGRESS,
        },
      },
    });
  });

  test("notifies admins when progress is logged", async () => {
    spyOn(taskRepo, "upsertProgressLog").mockResolvedValue({
      progressLog: { progress_id: "p1", quantity_done: 5 },
      updatedTask: { task_id: "t1", title: "My Task", current_quantity: 5, status: TaskStatus.IN_PROGRESS },
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([
      { user_id: "a1", push_token: "token-a1" },
    ]);
    sendPushNotificationMock.mockResolvedValue(undefined);

    await taskController.upsertProgressLog(
      createRequest({
        user: { user_id: "u1" },
        params: { id: "t1" } as Request["params"],
        body: { quantity_done: 5, unit: TaskUnit.METERS },
      }),
      createMockResponse(),
    );

    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      "token-a1",
      "Fremgang logget",
      "My Task",
      { taskId: "t1" },
      "a1",
    );
  });

  test("skips admin notification when the logger is the admin", async () => {
    spyOn(taskRepo, "upsertProgressLog").mockResolvedValue({
      progressLog: { progress_id: "p1", quantity_done: 5 },
      updatedTask: { task_id: "t1", title: "My Task", current_quantity: 5, status: TaskStatus.IN_PROGRESS },
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([
      { user_id: "a1", push_token: "token-a1" },
    ]);

    await taskController.upsertProgressLog(
      createRequest({
        user: { user_id: "a1" }, // same as admin
        params: { id: "t1" } as Request["params"],
        body: { quantity_done: 5, unit: TaskUnit.METERS },
      }),
      createMockResponse(),
    );

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });
});
