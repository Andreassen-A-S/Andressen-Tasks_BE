import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { Task, TaskStatus, UserRole } from "../src/generated/prisma/client";
import { InvalidUploadTokenError } from "../src/errors/domainErrors";
import * as commentRepo from "../src/repositories/commentRepository";
import * as attachmentRepo from "../src/repositories/attachmentRepository";
import * as taskEventRepo from "../src/repositories/taskEventRepository";
import * as userRepo from "../src/repositories/userRepository";
import * as storageService from "../src/services/storageService";

// prisma.task.findFirst is called directly by commentService.
// prisma.$transaction is used by commentService for createComment / updateComment.
const findFirstMock = mock<(...args: any[]) => Promise<Task | null>>(() =>
  Promise.resolve({ status: TaskStatus.PENDING } as Task),
);
const transactionMock = mock<(fn: (tx: any) => Promise<any>) => Promise<any>>();
const sendPushNotificationMock = mock<(...args: any[]) => Promise<void>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    task: { findFirst: findFirstMock },
    $transaction: transactionMock,
  },
}));

mock.module("../src/services/notificationService", () => ({
  sendPushNotification: sendPushNotificationMock,
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

  res.send = mock(() => res) as unknown as Response["send"];

  return res;
}

function createRequest(overrides: Record<string, any> = {}): Request {
  return {
    params: {},
    body: {},
    effectiveOrgId: null,
    user: { user_id: "u1", role: UserRole.USER },
    ...overrides,
  } as Request;
}

afterEach(() => {
  mock.restore();
  sendPushNotificationMock.mockReset();
  transactionMock.mockReset();
});

describe("commentController.listTaskComments", () => {
  test("returns 404 when task is missing", async () => {
    findFirstMock.mockResolvedValueOnce(null);
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
    findFirstMock.mockResolvedValueOnce({
      created_by: "another-user",
      assignments: [],
    } as any);

    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await commentController.listTaskComments(req, res);

    expect(res.statusCode).toBe(404);
    // commentService returns null for inaccessible tasks → controller returns 404
    expect(res.body).toEqual({ success: false, error: "Task not found" });
  });
});

describe("commentController.createComment", () => {
  test("returns 400 when body is empty", async () => {
    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "   " },
    });
    const res = createMockResponse();

    await commentController.createComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Message or attachment is required" });
  });

  test("returns 400 when upload_tokens contains non-string", async () => {
    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { upload_tokens: [123] },
    });
    const res = createMockResponse();

    await commentController.createComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Invalid upload tokens" });
  });

  test("returns 400 when upload_tokens contains duplicates", async () => {
    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { upload_tokens: ["tok1", "tok1"] },
    });
    const res = createMockResponse();

    await commentController.createComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Duplicate upload tokens" });
  });

  test("returns 400 when createComment throws invalid token error", async () => {
    findFirstMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [],
    } as any);
    // commentService wraps createComment in $transaction; the repo throws inside
    transactionMock.mockRejectedValue(new InvalidUploadTokenError());

    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { upload_tokens: ["tok-expired"] },
    });
    const res = createMockResponse();

    await commentController.createComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "One or more upload tokens are invalid or expired." });
  });

  test("creates comment and logs event", async () => {
    findFirstMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [],
    } as any);

    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([]);
    sendPushNotificationMock.mockResolvedValue(undefined);

    const createdComment = {
      comment_id: "c1",
      task_id: "t1",
      user_id: "u1",
      message: "hello",
      attachments: [],
    };
    // commentService calls $transaction which calls commentRepo.createComment(tx, data)
    transactionMock.mockImplementation(async (fn: any) => fn({}));
    const createSpy = spyOn(commentRepo, "createComment").mockResolvedValue(createdComment as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: " hello " },
    });
    const res = createMockResponse();

    await commentController.createComment(req, res);

    // createComment(tx, data) — second arg is the data
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0]?.[1]).toMatchObject({
      task_id: "t1",
      user_id: "u1",
      message: "hello",
    });
    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(201);
  });

  test("creates comment with upload tokens", async () => {
    findFirstMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [],
    } as any);

    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([]);
    sendPushNotificationMock.mockResolvedValue(undefined);

    const createdComment = {
      comment_id: "c1",
      task_id: "t1",
      user_id: "u1",
      message: "",
      attachments: [{ attachment_id: "a1", gcs_path: "tasks/t1/uuid.jpg", url: "https://storage.googleapis.com/bucket/tasks/t1/uuid.jpg" }],
    };
    transactionMock.mockImplementation(async (fn: any) => fn({}));
    const createSpy = spyOn(commentRepo, "createComment").mockResolvedValue(createdComment as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(storageService, "generateSignedReadUrl").mockResolvedValue("https://signed.example.com/uuid.jpg");

    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { upload_tokens: ["tok1"] },
    });
    const res = createMockResponse();

    await commentController.createComment(req, res);

    expect(createSpy.mock.calls[0]?.[1]).toMatchObject({
      task_id: "t1",
      user_id: "u1",
      upload_tokens: ["tok1"],
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { attachments: [{ attachment_id: "a1" }] } });
  });

  test("returns signed read URL for attachment in response", async () => {
    findFirstMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [],
    } as any);

    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([]);
    transactionMock.mockImplementation(async (fn: any) => fn({}));
    spyOn(commentRepo, "createComment").mockResolvedValue({
      comment_id: "c1",
      task_id: "t1",
      user_id: "u1",
      message: "",
      attachments: [{ attachment_id: "a1", gcs_path: "tasks/t1/uuid.jpg", url: "https://storage.googleapis.com/bucket/tasks/t1/uuid.jpg" }],
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(storageService, "generateSignedReadUrl").mockResolvedValue("https://signed.example.com/uuid.jpg");

    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { upload_tokens: ["tok1"] },
    });
    const res = createMockResponse();

    await commentController.createComment(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { attachments: [{ attachment_id: "a1", url: "https://signed.example.com/uuid.jpg" }] },
    });
  });
});

describe("commentController.createComment — notification routing", () => {
  function stubCommentInfra() {
    transactionMock.mockImplementation(async (fn: any) => fn({}));
    spyOn(commentRepo, "createComment").mockResolvedValue({
      comment_id: "c1",
      task_id: "t1",
      user_id: "u1",
      message: "hello",
      attachments: [],
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    sendPushNotificationMock.mockResolvedValue(undefined);
  }

  test("notifies non-commenter, non-admin assignee", async () => {
    stubCommentInfra();
    findFirstMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [
        { user_id: "u1", user: { user_id: "u1", role: UserRole.USER, push_token: "token-u1" } },
        { user_id: "u2", user: { user_id: "u2", role: UserRole.USER, push_token: "token-u2" } },
      ],
    } as any);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([]);

    await commentController.createComment(
      createRequest({ params: { taskId: "t1", screen: "comments" }, user: { user_id: "u1", role: UserRole.USER }, body: { message: "hello" } }),
      createMockResponse(),
    );
    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      "token-u2",
      "Ny kommentar på din opgave",
      "Test Task",
      { taskId: "t1", screen: "comments" },
      "u2",
    );
  });

  test("skips commenter from assignee notifications", async () => {
    stubCommentInfra();
    findFirstMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [
        { user_id: "u1", user: { user_id: "u1", role: UserRole.USER, push_token: "token-u1" } },
      ],
    } as any);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([]);

    await commentController.createComment(
      createRequest({ params: { taskId: "t1", screen: "comments" }, user: { user_id: "u1", role: UserRole.USER }, body: { message: "hello" } }),
      createMockResponse(),
    );
    expect(sendPushNotificationMock).not.toHaveBeenCalled();
  });

  test("skips admin-role assignees from the assignee loop (they get a separate admin notification instead)", async () => {
    stubCommentInfra();
    findFirstMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [
        { user_id: "a1", user: { user_id: "a1", role: UserRole.ADMIN, push_token: "token-a1" } },
      ],
    } as any);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([
      { user_id: "a1", push_token: "token-a1" },
    ]);

    await commentController.createComment(
      createRequest({ params: { taskId: "t1", screen: "comments" }, user: { user_id: "u1", role: UserRole.USER }, body: { message: "hello" } }),
      createMockResponse(),
    );
    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      "token-a1",
      "Ny kommentar",
      "Test Task",
      { taskId: "t1", screen: "comments" },
      "a1",
    );
  });

  test("notifies admins separately from assignees", async () => {
    stubCommentInfra();
    findFirstMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [],
    } as any);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([
      { user_id: "a1", push_token: "token-a1" },
    ]);

    await commentController.createComment(
      createRequest({ params: { taskId: "t1", screen: "comments" }, user: { user_id: "u1", role: UserRole.USER }, body: { message: "hello" } }),
      createMockResponse(),
    );
    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      "token-a1",
      "Ny kommentar",
      "Test Task",
      { taskId: "t1", screen: "comments" },
      "a1",
    );
  });

  test("skips commenter from admin notifications when commenter is an admin", async () => {
    stubCommentInfra();
    findFirstMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "a1",
      assignments: [],
    } as any);
    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([
      { user_id: "a1", push_token: "token-a1" },
      { user_id: "a2", push_token: "token-a2" },
    ]);

    await commentController.createComment(
      createRequest({ params: { taskId: "t1", screen: "comments" }, user: { user_id: "a1", role: UserRole.ADMIN }, body: { message: "hello" } }),
      createMockResponse(),
    );
    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationMock).toHaveBeenCalledWith(
      "token-a2",
      "Ny kommentar",
      "Test Task",
      { taskId: "t1", screen: "comments" },
      "a2",
    );
  });
});

describe("commentController.deleteComment", () => {
  test("returns 403 when non-owner non-admin tries to delete", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "owner",
      task_id: "t1",
    } as never);
    // commentService also checks task via prisma.task.findFirst
    findFirstMock.mockResolvedValueOnce({ status: TaskStatus.PENDING } as any);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await commentController.deleteComment(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
    });
  });
});

describe("commentController.updateComment", () => {
  test("updates comment and logs event", async () => {
    const existingComment = {
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    };
    spyOn(commentRepo, "getCommentById").mockResolvedValue(existingComment as never);
    // commentService checks task for archived status
    findFirstMock.mockResolvedValueOnce({ status: TaskStatus.PENDING } as any);
    transactionMock.mockImplementation(async (fn: any) => fn({}));
    const updatedComment = {
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "new",
    };
    spyOn(commentRepo, "updateComment").mockResolvedValue({
      comment: updatedComment,
      removedGcsPaths: [],
    } as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

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
      data: updatedComment,
    });
  });

  test("returns 403 when non-owner tries to update", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "owner",
      task_id: "t1",
      message: "old",
    } as never);
    findFirstMock.mockResolvedValueOnce({ status: TaskStatus.PENDING } as any);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new" },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false });
  });

  test("returns 403 when admin tries to update another user's comment", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "owner",
      task_id: "t1",
      message: "old",
    } as never);
    findFirstMock.mockResolvedValueOnce({ status: TaskStatus.PENDING } as any);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "admin1", role: UserRole.ADMIN },
      body: { message: "new" },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(res.statusCode).toBe(403);
  });

  test("returns 400 when upload_tokens is not an array", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    } as never);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new", upload_tokens: "not-an-array" },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Invalid upload tokens" });
  });

  test("returns 400 when upload_tokens contains non-string", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    } as never);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new", upload_tokens: [123] },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Invalid upload tokens" });
  });

  test("returns 400 when upload_tokens contains duplicates", async () => {
    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new", upload_tokens: ["tok1", "tok1"] },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Duplicate upload tokens" });
  });

  test("returns 400 when updateComment throws invalid token error", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    } as never);
    findFirstMock.mockResolvedValueOnce({ status: TaskStatus.PENDING } as any);
    transactionMock.mockRejectedValue(new InvalidUploadTokenError());

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new", upload_tokens: ["tok-expired"] },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "One or more upload tokens are invalid or expired." });
  });

  test("forwards upload_tokens to repository", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    } as never);
    findFirstMock.mockResolvedValueOnce({ status: TaskStatus.PENDING } as any);
    transactionMock.mockImplementation(async (fn: any) => fn({}));
    const updateSpy = spyOn(commentRepo, "updateComment").mockResolvedValue({
      comment: { comment_id: "c1", user_id: "u1", task_id: "t1", message: "new" },
      removedGcsPaths: [],
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new", upload_tokens: ["tok1", "tok2"] },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    // updateComment(db, id, message, tokens, removeIds) — check args
    expect(updateSpy.mock.calls[0]?.[1]).toBe("c1");
    expect(updateSpy.mock.calls[0]?.[2]).toBe("new");
    expect(updateSpy.mock.calls[0]?.[3]).toEqual(["tok1", "tok2"]);
    expect(updateSpy.mock.calls[0]?.[4]).toBeUndefined();
  });

  test("returns 400 when remove_attachment_ids is not an array", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    } as never);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new", remove_attachment_ids: "not-an-array" },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Invalid remove_attachment_ids" });
  });

  test("returns 400 when remove_attachment_ids contains non-string", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    } as never);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new", remove_attachment_ids: [123] },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Invalid remove_attachment_ids" });
  });

  test("returns 400 when no changes are provided", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    } as never);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: {},
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "No changes provided" });
  });

  test("updates without message when only remove_attachment_ids provided", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "existing",
    } as never);
    findFirstMock.mockResolvedValueOnce({ status: TaskStatus.PENDING } as any);
    spyOn(attachmentRepo, "getAttachmentsByCommentId").mockResolvedValue([
      { attachment_id: "a1", gcs_path: "tasks/t1/uuid.jpg" },
    ] as never);
    transactionMock.mockImplementation(async (fn: any) => fn({}));
    const updatedComment = {
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "existing",
    };
    const updateSpy = spyOn(commentRepo, "updateComment").mockResolvedValue({
      comment: updatedComment,
      removedGcsPaths: ["tasks/t1/uuid.jpg"],
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(storageService, "deleteFile").mockResolvedValue(undefined);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { remove_attachment_ids: ["a1"] },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(updateSpy.mock.calls[0]?.[1]).toBe("c1");
    expect(updateSpy.mock.calls[0]?.[2]).toBeUndefined();
    expect(updateSpy.mock.calls[0]?.[4]).toEqual(["a1"]);
    expect(res.body).toMatchObject({ success: true });
  });

  test("fetches attachments, runs DB update, then deletes GCS files when removing attachments", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    } as never);
    findFirstMock.mockResolvedValueOnce({ status: TaskStatus.PENDING } as any);
    spyOn(attachmentRepo, "getAttachmentsByCommentId").mockResolvedValue([
      { attachment_id: "a1", gcs_path: "tasks/t1/uuid.jpg" },
    ] as never);
    transactionMock.mockImplementation(async (fn: any) => fn({}));
    const callOrder: string[] = [];
    const updateSpy = spyOn(commentRepo, "updateComment").mockImplementation(async () => {
      callOrder.push("db");
      return { comment: { comment_id: "c1", user_id: "u1", task_id: "t1", message: "new" }, removedGcsPaths: [] } as any;
    });
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    const deleteFileSpy = spyOn(storageService, "deleteFile").mockImplementation(async () => {
      callOrder.push("gcs");
    });

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new", remove_attachment_ids: ["a1"] },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    // GCS deletion happens in the service after DB, driven by gcsPathsToDelete fetched from attachmentRepo
    expect(deleteFileSpy).toHaveBeenCalledWith("tasks/t1/uuid.jpg");
    // DB operation happens inside the transaction (inside commentService), then GCS after
    expect(callOrder).toEqual(["db", "gcs"]);
  });
});
