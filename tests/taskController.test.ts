import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import {
  TaskEventType,
  TaskPriority,
  TaskStatus,
  TaskUnit,
} from "../src/generated/prisma/client";
import * as taskController from "../src/controllers/taskController";
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
import * as taskEventRepo from "../src/repositories/taskEventRepository";
import * as taskRepo from "../src/repositories/taskRepository";
import * as userRepo from "../src/repositories/userRepository";
import {
  AssignmentNotFoundError,
  CrossOrganizationReferenceError,
  TaskAlreadyDoneError,
  TaskNotFoundError,
  TaskNotProgressableError,
} from "../src/repositories/taskRepository";

const sendPushNotificationMock = mock<(...args: any[]) => Promise<void>>();

mock.module("../src/services/notificationService", () => ({
  sendPushNotification: sendPushNotificationMock,
}));

const transactionMock = mock<(fn: (tx: any) => Promise<any>) => Promise<any>>();
mock.module("../src/db/prisma", () => ({
  prisma: { $transaction: transactionMock },
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
  transactionMock.mockReset();
});

describe("taskController.listTasks", () => {
  test("returns tasks", async () => {
    const tasks = [{ task_id: "t1" }];
    spyOn(taskRepo, "getAllTasks").mockResolvedValue(tasks as never);
    const req = createRequest({ user: { user_id: "u1", role: "USER", organization_id: null } });
    const res = createMockResponse();

    await callController(taskController.listTasks, req, res);

    expect(res.body).toEqual({ success: true, data: tasks });
  });

  test("returns 401 when user is missing", async () => {
    const repoSpy = spyOn(taskRepo, "getAllTasks");
    const req = createRequest({ user: undefined });
    const res = createMockResponse();

    await callController(taskController.listTasks, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Unauthorized" });
  });

  test("returns 500 when repository fails", async () => {
    spyOn(taskRepo, "getAllTasks").mockRejectedValue(new Error("db fail"));
    const req = createRequest({ user: { user_id: "u1", role: "USER", organization_id: null } });
    const res = createMockResponse();

    await callController(taskController.listTasks, req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: "Internal server error",
    });
  });
});

describe("taskController.getTask", () => {
  test("returns 400 for invalid id", async () => {
    const repoSpy = spyOn(taskRepo, "getTaskById");
    const req = createRequest({ params: { id: " " } as Request["params"] });
    const res = createMockResponse();

    await callController(taskController.getTask, req, res);

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

    await callController(taskController.createTask, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Unauthorized" });
  });

  test("sets created_by to authenticated user when missing", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
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

    await callController(taskController.createTask, req, res);

    expect(repoSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ created_by: "u1", title: "Task" }),
      undefined,
    );
    expect(res.statusCode).toBe(201);
  });

  test("normalizes created_by to authenticated user when a different value is supplied", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    const repoSpy = spyOn(
      taskRepo,
      "createTaskWithAssignments",
    ).mockResolvedValue({
      task_id: "t1",
      title: "Task",
      created_by: "u1",
      assignments: [],
    } as any);

    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as any);

    const req = createRequest({
      user: { user_id: "u1" },
      body: { title: "Task", project_id: "p1", created_by: "u2" },
    });
    const res = createMockResponse();

    await callController(taskController.createTask, req, res);

    // Service normalizes created_by to the authenticated actor (u1), ignoring the supplied value (u2).
    expect(repoSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ created_by: "u1" }),
      undefined,
    );
    expect(res.statusCode).toBe(201);
  });


  test("creates task and logs task + assignment events", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
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

    await callController(taskController.createTask, req, res);

    expect(eventSpy).toHaveBeenCalledTimes(3);
    expect(eventSpy.mock.calls[0]?.[1]?.type).toBe(TaskEventType.TASK_CREATED);
    expect(eventSpy.mock.calls[1]?.[1]?.type).toBe(
      TaskEventType.ASSIGNMENT_CREATED,
    );
    expect(eventSpy.mock.calls[2]?.[1]?.type).toBe(
      TaskEventType.ASSIGNMENT_CREATED,
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: task });
  });

  test("passes effective org to create repository", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    const repoSpy = spyOn(taskRepo, "createTaskWithAssignments").mockResolvedValue({
      task_id: "t1",
      assignments: [],
    } as any);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as any);

    const req = createRequest({
      user: { user_id: "u1" },
      effectiveOrgId: "org-a",
      body: { title: "Task", project_id: "p1" },
    });
    const res = createMockResponse();

    await callController(taskController.createTask, req, res);

    expect(repoSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ project_id: "p1", created_by: "u1" }),
      "org-a",
    );
  });

  test("rejects cross-org project or assignee references on create", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "createTaskWithAssignments").mockRejectedValue(
      new CrossOrganizationReferenceError("Assigned users must belong to the task organization."),
    );

    const req = createRequest({
      user: { user_id: "u1" },
      effectiveOrgId: "org-a",
      body: { title: "Task", project_id: "project-a", assigned_users: ["user-b"] },
    });
    const res = createMockResponse();

    await callController(taskController.createTask, req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: "Assigned users must belong to the task organization.",
    });
  });
});

describe("taskController.updateTask", () => {
  test("updates task and logs TASK_UPDATED", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    const oldTask = { task_id: "t1", title: "old", assigned_users: ["u1"], project: { name: "P1", color: null } };
    const updatedTask = { task_id: "t1", title: "new", project: { name: "P1", color: null }, assignments: [{ assignment_id: "a1", user_id: "u1" }] };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTaskPlatform").mockResolvedValue(updatedTask as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { title: "new" },
    });
    const res = createMockResponse();

    await callController(taskController.updateTask, req, res);

    expect(taskRepo.updateTaskPlatform).toHaveBeenCalledWith(expect.anything(), "t1", { title: "new" }, "u1");
    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0]?.[1]?.type).toBe(TaskEventType.TASK_UPDATED);
    expect(res.body).toEqual({ success: true, data: { task_id: "t1", title: "new", project: { name: "P1", color: null }, assigned_users: ["u1"] } });
  });

  test("returns 404 when updateTask throws TaskNotFoundError", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1" } as never);
    spyOn(taskRepo, "updateTaskPlatform").mockRejectedValue(new TaskNotFoundError("t1"));

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { title: "new" },
    });
    const res = createMockResponse();

    await callController(taskController.updateTask, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found: t1" });
  });

  test("rejects task update when task is outside effective org", async () => {
    spyOn(taskRepo, "getTaskById").mockResolvedValue(null);
    const updateSpy = spyOn(taskRepo, "updateTaskInOrg");

    const req = createRequest({
      user: { user_id: "u-org-a" },
      effectiveOrgId: "org-a",
      params: { id: "task-org-b" } as Request["params"],
      body: { title: "nope" },
    });
    const res = createMockResponse();

    await callController(taskController.updateTask, req, res);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found" });
  });

  test("rejects moving task to a project from another org", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", assigned_users: [] } as never);
    spyOn(taskRepo, "updateTaskInOrg").mockRejectedValue(
      new CrossOrganizationReferenceError("Task cannot be moved to a project in another organization."),
    );

    const req = createRequest({
      user: { user_id: "u1" },
      effectiveOrgId: "org-a",
      params: { id: "t1" } as Request["params"],
      body: { project_id: "project-org-b" },
    });
    const res = createMockResponse();

    await callController(taskController.updateTask, req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: "Task cannot be moved to a project in another organization.",
    });
  });

  test("rejects assigning task to users from another org on update", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", assigned_users: [] } as never);
    spyOn(taskRepo, "updateTaskInOrg").mockRejectedValue(
      new CrossOrganizationReferenceError("Assigned users must belong to the task organization."),
    );

    const req = createRequest({
      user: { user_id: "u1" },
      effectiveOrgId: "org-a",
      params: { id: "t1" } as Request["params"],
      body: { assigned_users: ["user-org-b"] },
    });
    const res = createMockResponse();

    await callController(taskController.updateTask, req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: "Assigned users must belong to the task organization.",
    });
  });

  test("returns 400 when updateTask throws TaskAlreadyDoneError", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1" } as never);
    spyOn(taskRepo, "updateTaskPlatform").mockRejectedValue(new TaskAlreadyDoneError());

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { status: TaskStatus.DONE },
    });
    const res = createMockResponse();

    await callController(taskController.updateTask, req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Task is already marked as done and cannot be set to done again",
    });
  });

  test("updates assignments and logs assignment diffs + TASK_UPDATED", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
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
    spyOn(taskRepo, "updateTaskPlatform").mockResolvedValue(updatedTask as never);
    spyOn(userRepo, "getPushTokensForUsers").mockResolvedValue(new Map());
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { assigned_users: ["u1", "u3"] },
    });
    const res = createMockResponse();

    await callController(taskController.updateTask, req, res);

    expect(eventSpy).toHaveBeenCalledTimes(3);
    expect(eventSpy.mock.calls[0]?.[1]?.type).toBe(TaskEventType.ASSIGNMENT_CREATED);
    expect(eventSpy.mock.calls[1]?.[1]?.type).toBe(TaskEventType.ASSIGNMENT_DELETED);
    expect(eventSpy.mock.calls[2]?.[1]?.type).toBe(TaskEventType.TASK_UPDATED);
    expect(res.body).toEqual({
      success: true,
      data: { task_id: "t1", project: { name: "P1", color: null }, assigned_users: ["u1", "u3"] },
    });
  });

  test("returns 404 when updateTask throws TaskNotFoundError (with assignments)", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", assigned_users: [] } as never);
    spyOn(taskRepo, "updateTaskPlatform").mockRejectedValue(new TaskNotFoundError("t1"));

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { assigned_users: ["u1"] },
    });
    const res = createMockResponse();

    await callController(taskController.updateTask, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found: t1" });
  });

  test("returns 400 when updateTask throws TaskAlreadyDoneError (with assignments)", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1", assigned_users: [] } as never);
    spyOn(taskRepo, "updateTaskPlatform").mockRejectedValue(new TaskAlreadyDoneError());

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { assigned_users: ["u1"], status: TaskStatus.DONE },
    });
    const res = createMockResponse();

    await callController(taskController.updateTask, req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Task is already marked as done and cannot be set to done again",
    });
  });

  test("notifies admins when status transitions to DONE", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    const oldTask = { task_id: "t1", title: "My Task", status: TaskStatus.IN_PROGRESS, assigned_users: [] };
    const updatedTask = { task_id: "t1", title: "My Task", status: TaskStatus.DONE, assignments: [] };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTaskPlatform").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([
      { user_id: "a1", push_token: "token-a1" },
    ]);
    sendPushNotificationMock.mockResolvedValue(undefined);

    await callController(
      taskController.updateTask,
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
    transactionMock.mockImplementation((fn: any) => fn({}));
    const oldTask = { task_id: "t1", title: "My Task", status: TaskStatus.PENDING, assigned_users: [] };
    const updatedTask = { task_id: "t1", title: "My Task", status: TaskStatus.IN_PROGRESS, assignments: [] };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTaskPlatform").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    const adminSpy = spyOn(userRepo, "getAdminPushTokens");

    await callController(
      taskController.updateTask,
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
    transactionMock.mockImplementation((fn: any) => fn({}));
    const pastDate = new Date("2020-06-15T12:00:00Z");
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
    spyOn(taskRepo, "updateTaskPlatform").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getPushTokensForUsers").mockResolvedValue(
      new Map([["u2", "token-u2"]]),
    );
    sendPushNotificationMock.mockResolvedValue(undefined);

    await callController(
      taskController.updateTask,
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
    transactionMock.mockImplementation((fn: any) => fn({}));
    const futureDate = new Date("2099-01-01T12:00:00Z");
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
    spyOn(taskRepo, "updateTaskPlatform").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    await callController(
      taskController.updateTask,
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
    transactionMock.mockImplementation((fn: any) => fn({}));
    const pastDate = new Date("2020-06-15T12:00:00Z");
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
    spyOn(taskRepo, "updateTaskPlatform").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([]);

    await callController(
      taskController.updateTask,
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
    transactionMock.mockImplementation((fn: any) => fn({}));
    const pastDate = new Date("2020-06-15T12:00:00Z");
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
    spyOn(taskRepo, "updateTaskPlatform").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    await callController(
      taskController.updateTask,
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
    transactionMock.mockImplementation((fn: any) => fn({}));
    const oldTask = { task_id: "t1", title: "My Task", status: TaskStatus.IN_PROGRESS, assigned_users: ["u1"] };
    const updatedTask = {
      task_id: "t1",
      title: "My Task",
      status: TaskStatus.DONE,
      assignments: [{ assignment_id: "a1", user_id: "u1" }],
    };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(oldTask as never);
    spyOn(taskRepo, "updateTaskPlatform").mockResolvedValue(updatedTask as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getPushTokensForUsers").mockResolvedValue(new Map());
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([
      { user_id: "a1", push_token: "token-a1" },
    ]);
    sendPushNotificationMock.mockResolvedValue(undefined);

    await callController(
      taskController.updateTask,
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
    const deleteSpy = spyOn(taskRepo, "deleteTaskPlatform").mockResolvedValue(
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

    await callController(taskController.deleteTask, req, res);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0]?.[1]?.type).toBe(TaskEventType.TASK_DELETED);
    expect(deleteSpy).toHaveBeenCalledWith(expect.anything(), "t1");
    expect(res.statusCode).toBe(204);
  });

  test("rejects deleting task outside effective org", async () => {
    spyOn(taskRepo, "getTaskById").mockResolvedValue(null);
    const deleteSpy = spyOn(taskRepo, "deleteTaskInOrg");

    const req = createRequest({
      user: { user_id: "u-org-a" },
      effectiveOrgId: "org-a",
      params: { id: "task-org-b" } as Request["params"],
    });
    const res = createMockResponse();

    await callController(taskController.deleteTask, req, res);

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found" });
  });

  test("maps repository task delete org miss to 404", async () => {
    spyOn(taskRepo, "getTaskById").mockResolvedValue({ task_id: "t1" } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(taskRepo, "deleteTaskInOrg").mockRejectedValue(new TaskNotFoundError("t1"));

    const req = createRequest({
      user: { user_id: "u1" },
      effectiveOrgId: "org-a",
      params: { id: "t1" } as Request["params"],
    });
    const res = createMockResponse();

    await callController(taskController.deleteTask, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found: t1" });
  });
});

describe("taskController.upsertProgressLog", () => {
  test("returns 404 when task does not exist", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "upsertProgressLogPlatform").mockRejectedValue(
      new TaskNotFoundError("t1"),
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { quantity_done: 1, unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await callController(taskController.upsertProgressLog, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found: t1" });
  });

  test("returns 400 when task is not progressable", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "upsertProgressLogPlatform").mockRejectedValue(
      new TaskNotProgressableError(TaskStatus.DONE),
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { quantity_done: 1, unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await callController(taskController.upsertProgressLog, req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Cannot log progress on tasks with status: DONE",
    });
  });

  test("returns 404 when assignment does not exist", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "upsertProgressLogPlatform").mockRejectedValue(
      new AssignmentNotFoundError(),
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "t1" } as Request["params"],
      body: { quantity_done: 1, note: "done", unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await callController(taskController.upsertProgressLog, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: "Assignment not found",
    });
  });

  test("upserts progress and logs PROGRESS_LOGGED", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
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

    spyOn(taskRepo, "upsertProgressLogPlatform").mockResolvedValue({
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

    await callController(taskController.upsertProgressLog, req, res);

    expect(taskRepo.upsertProgressLogPlatform).toHaveBeenCalledWith(expect.anything(), "t1", "u1", 5, TaskUnit.METERS, "good");
    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0]?.[1]?.type).toBe(TaskEventType.PROGRESS_LOGGED);
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
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "upsertProgressLogPlatform").mockResolvedValue({
      progressLog: { progress_id: "p1", quantity_done: 5 },
      updatedTask: { task_id: "t1", title: "My Task", current_quantity: 5, status: TaskStatus.IN_PROGRESS },
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([
      { user_id: "a1", push_token: "token-a1" },
    ]);
    sendPushNotificationMock.mockResolvedValue(undefined);

    await callController(
      taskController.upsertProgressLog,
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
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "upsertProgressLogPlatform").mockResolvedValue({
      progressLog: { progress_id: "p1", quantity_done: 5 },
      updatedTask: { task_id: "t1", title: "My Task", current_quantity: 5, status: TaskStatus.IN_PROGRESS },
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([
      { user_id: "a1", push_token: "token-a1" },
    ]);

    await callController(
      taskController.upsertProgressLog,
      createRequest({
        user: { user_id: "a1" }, // same as admin
        params: { id: "t1" } as Request["params"],
        body: { quantity_done: 5, unit: TaskUnit.METERS },
      }),
      createMockResponse(),
    );

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });

  test("rejects progress on task outside effective org", async () => {
    transactionMock.mockImplementation((fn: any) => fn({}));
    spyOn(taskRepo, "upsertProgressLogInOrg").mockRejectedValue(new TaskNotFoundError("task-org-b"));

    const req = createRequest({
      user: { user_id: "u-org-a" },
      effectiveOrgId: "org-a",
      params: { id: "task-org-b" } as Request["params"],
      body: { quantity_done: 1, unit: TaskUnit.METERS },
    });
    const res = createMockResponse();

    await callController(taskController.upsertProgressLog, req, res);

    expect(taskRepo.upsertProgressLogInOrg).toHaveBeenCalledWith(
      expect.anything(),
      "task-org-b",
      "org-a",
      "u-org-a",
      1,
      TaskUnit.METERS,
      undefined,
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found: task-org-b" });
  });
});
