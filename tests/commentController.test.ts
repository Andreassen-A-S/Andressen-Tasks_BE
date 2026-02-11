import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { Task, UserRole } from "../src/generated/prisma/client";
import * as commentRepo from "../src/repositories/commentRepository";
import * as taskEventRepo from "../src/repositories/taskEventRepository";

const findUniqueMock = mock<(...args: any[]) => Promise<Task | null>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    task: {
      findUnique: findUniqueMock,
    },
  },
}));

const commentController = await import("../src/controllers/commentController");

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

describe("commentController.listTaskComments", () => {
  test("returns 404 when task is missing", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await commentController.listTaskComments(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found" });
  });

  test("returns 403 when user has no access", async () => {
    findUniqueMock.mockResolvedValueOnce({
      created_by: "another-user",
      assignments: [],
    } as any);

    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await commentController.listTaskComments(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "Access denied" });
  });
});

describe("commentController.createComment", () => {
  test("returns 400 when message is missing", async () => {
    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "   " },
    });
    const res = createMockResponse();

    await commentController.createComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Message is required" });
  });

  test("creates comment and logs event", async () => {
    findUniqueMock.mockResolvedValueOnce({
      created_by: "u1",
      assignments: [],
    } as any);

    const createSpy = spyOn(commentRepo, "createComment").mockResolvedValue({
      comment_id: "c1",
      task_id: "t1",
      user_id: "u1",
      message: "hello",
    } as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      {} as never,
    );

    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: " hello " },
    });
    const res = createMockResponse();

    await commentController.createComment(req, res);

    expect(createSpy).toHaveBeenCalledWith({
      task_id: "t1",
      user_id: "u1",
      message: "hello",
    });
    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(201);
  });
});

describe("commentController.deleteComment", () => {
  test("returns 403 when non-owner non-admin tries to delete", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "owner",
      task_id: "t1",
    } as never);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await commentController.deleteComment(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: "Not authorized to delete this comment",
    });
  });
});

describe("commentController.updateComment", () => {
  test("updates comment and logs event", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    } as never);
    spyOn(commentRepo, "updateComment").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "new",
    } as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue(
      {} as never,
    );

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: " new " },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({
      success: true,
      data: { comment_id: "c1", user_id: "u1", task_id: "t1", message: "new" },
    });
  });
});
