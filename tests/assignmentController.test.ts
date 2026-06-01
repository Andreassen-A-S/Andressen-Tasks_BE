import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { TaskEventType, TaskStatus } from "../src/generated/prisma/client";
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

import * as assignmentController from "../src/controllers/assignmentController";
import * as assignmentService from "../src/services/assignmentService";
import * as assignmentRepo from "../src/repositories/assignmentRepository";
import * as taskRepo from "../src/repositories/taskRepository";
import * as taskEventRepo from "../src/repositories/taskEventRepository";
import * as userRepo from "../src/repositories/userRepository";
import { AssignmentCrossOrganizationError, DuplicateAssignmentError } from "../src/errors/domainErrors";

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
    query: {},
    effectiveOrgId: null,
    user: { user_id: "u1", role: "ADMIN" },
    ...overrides,
  } as Request;
}

afterEach(() => {
  mock.restore();
});

describe("assignmentController.listAssignments", () => {
  test("filters by userId", async () => {
    const data = [{ assignment_id: "a1" }];
    const repoSpy = spyOn(
      assignmentRepo,
      "getUserAssignments",
    ).mockResolvedValue(data as never);
    const req = createRequest({ query: { userId: "u1" } });
    const res = createMockResponse();

    await callController(assignmentController.listAssignments, req, res);

    expect(repoSpy).toHaveBeenCalledWith("u1", null);
    expect(res.body).toEqual({ success: true, data });
  });
});

describe("assignmentController.assignTask", () => {
  test("creates assignment and logs ASSIGNMENT_CREATED", async () => {
    const assignment = { assignment_id: "a1", task_id: "t1" };
    spyOn(taskRepo, "getTaskById").mockResolvedValue(
      { task_id: "t1", status: TaskStatus.IN_PROGRESS } as never,
    );
    const assignSpy = spyOn(assignmentRepo, "assignTaskToUser").mockResolvedValue(
      assignment as never,
    );
    spyOn(userRepo, "getPushToken").mockResolvedValue(null);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      {} as never,
    );
    const req = createRequest({
      user: { user_id: "u1" },
      body: { task_id: "t1", user_id: "u2" },
    });
    const res = createMockResponse();

    await callController(assignmentController.assignTask, req, res);

    expect(assignSpy).toHaveBeenCalledWith({ task_id: "t1", user_id: "u2" }, null);
    expect(eventSpy).toHaveBeenCalledTimes(1);
    // createTaskEvent(db, data) — check second arg (index 1) for the event type
    expect(eventSpy.mock.calls[0]?.[1]?.type).toBe(
      TaskEventType.ASSIGNMENT_CREATED,
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: assignment });
  });

  test("returns 409 for duplicate assignment", async () => {
    spyOn(assignmentService, "assignTaskToUser").mockRejectedValue(
      new DuplicateAssignmentError(),
    );
    const req = createRequest({
      user: { user_id: "u1" },
      body: { task_id: "t1", user_id: "u2" },
    });
    const res = createMockResponse();

    await callController(assignmentController.assignTask, req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ success: false, error: "User is already assigned to this task" });
  });

  test("rejects assigning task to a user from another organization", async () => {
    spyOn(taskRepo, "getTaskById").mockResolvedValue(
      { task_id: "t1", status: TaskStatus.IN_PROGRESS } as never,
    );
    spyOn(assignmentRepo, "assignTaskToUser").mockRejectedValue(
      new AssignmentCrossOrganizationError("Assigned user must belong to the task organization."),
    );
    const req = createRequest({
      user: { user_id: "admin-a" },
      effectiveOrgId: "org-a",
      body: { task_id: "task-org-a", user_id: "user-org-b" },
    });
    const res = createMockResponse();

    await callController(assignmentController.assignTask, req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: "Assigned user must belong to the task organization.",
    });
  });
});

describe("assignmentController.getAssignment", () => {
  test("returns 400 for invalid id", async () => {
    const repoSpy = spyOn(assignmentRepo, "getAssignmentById");
    const req = createRequest({ params: { id: "" } as Request["params"] });
    const res = createMockResponse();

    await callController(assignmentController.getAssignment, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Missing or invalid id" });
  });
});

describe("assignmentController.deleteAssignment", () => {
  test("deletes assignment and logs ASSIGNMENT_DELETED", async () => {
    const existing = { assignment_id: "a1", task_id: "t1" };
    spyOn(assignmentRepo, "getAssignmentById").mockResolvedValue(
      existing as never,
    );
    const deleteSpy = spyOn(
      assignmentRepo,
      "deleteAssignment",
    ).mockResolvedValue(undefined);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      {} as never,
    );

    const req = createRequest({
      user: { user_id: "u1" },
      params: { id: "a1" } as Request["params"],
    });
    const res = createMockResponse();

    await callController(assignmentController.deleteAssignment, req, res);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    // createTaskEvent(db, data) — check second arg (index 1) for the event type
    expect(eventSpy.mock.calls[0]?.[1]?.type).toBe(
      TaskEventType.ASSIGNMENT_DELETED,
    );
    expect(deleteSpy).toHaveBeenCalledWith("a1", null);
    expect(res.statusCode).toBe(204);
  });

  test("passes effective org to assignment delete repository", async () => {
    const existing = {
      assignment_id: "a1",
      task_id: "t1",
      task: { status: TaskStatus.IN_PROGRESS },
    };
    spyOn(assignmentRepo, "getAssignmentById").mockResolvedValue(existing as never);
    const deleteSpy = spyOn(assignmentRepo, "deleteAssignment").mockResolvedValue(undefined);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({
      user: { user_id: "u1" },
      effectiveOrgId: "org-a",
      params: { id: "a1" } as Request["params"],
    });
    const res = createMockResponse();

    await callController(assignmentController.deleteAssignment, req, res);

    expect(deleteSpy).toHaveBeenCalledWith("a1", "org-a");
    expect(res.statusCode).toBe(204);
  });
});
