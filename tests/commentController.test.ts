import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { Task, UserRole } from "../src/generated/prisma/client";
import * as commentRepo from "../src/repositories/commentRepository";
import * as attachmentRepo from "../src/repositories/attachmentRepository";
import * as taskEventRepo from "../src/repositories/taskEventRepository";
import * as userRepo from "../src/repositories/userRepository";
import * as storageService from "../src/services/storageService";

const findUniqueMock = mock<(...args: any[]) => Promise<Task | null>>();
const sendPushNotificationMock = mock<(...args: any[]) => Promise<void>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    task: {
      findUnique: findUniqueMock,
    },
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
    findUniqueMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [],
    } as any);
    spyOn(commentRepo, "createComment").mockRejectedValue(
      new Error("One or more upload tokens are invalid or expired"),
    );

    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { upload_tokens: ["tok-expired"] },
    });
    const res = createMockResponse();

    await commentController.createComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "One or more upload tokens are invalid or expired" });
  });

  test("creates comment and logs event", async () => {
    findUniqueMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [],
    } as any);

    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([]);
    sendPushNotificationMock.mockResolvedValue(undefined);

    const createSpy = spyOn(commentRepo, "createComment").mockResolvedValue({
      comment_id: "c1",
      task_id: "t1",
      user_id: "u1",
      message: "hello",
      attachments: [],
    } as never);
    const eventSpy = spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

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
      upload_tokens: undefined,
    });
    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(201);
  });

  test("creates comment with upload tokens", async () => {
    findUniqueMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [],
    } as any);

    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([]);
    sendPushNotificationMock.mockResolvedValue(undefined);

    const createSpy = spyOn(commentRepo, "createComment").mockResolvedValue({
      comment_id: "c1",
      task_id: "t1",
      user_id: "u1",
      message: "",
      attachments: [{ attachment_id: "a1", gcs_path: "tasks/t1/uuid.jpg", url: "https://storage.googleapis.com/bucket/tasks/t1/uuid.jpg" }],
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({
      params: { taskId: "t1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { upload_tokens: ["tok1"] },
    });
    const res = createMockResponse();

    await commentController.createComment(req, res);

    expect(createSpy).toHaveBeenCalledWith({
      task_id: "t1",
      user_id: "u1",
      message: "",
      upload_tokens: ["tok1"],
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { attachments: [{ attachment_id: "a1" }] } });
  });

  test("returns signed read URL for attachment in response", async () => {
    findUniqueMock.mockResolvedValueOnce({
      task_id: "t1",
      title: "Test Task",
      created_by: "u1",
      assignments: [],
    } as any);

    spyOn(userRepo, "getAdminPushTokens").mockResolvedValue([]);
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
    findUniqueMock.mockResolvedValueOnce({
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
    findUniqueMock.mockResolvedValueOnce({
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
    findUniqueMock.mockResolvedValueOnce({
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
    findUniqueMock.mockResolvedValueOnce({
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
    findUniqueMock.mockResolvedValueOnce({
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
      data: { comment_id: "c1", user_id: "u1", task_id: "t1", message: "new" },
    });
  });

  test("returns 403 when non-owner tries to update", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "owner",
      task_id: "t1",
      message: "old",
    } as never);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new" },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "Not authorized to edit this comment" });
  });

  test("returns 403 when admin tries to update another user's comment", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "owner",
      task_id: "t1",
      message: "old",
    } as never);

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
    spyOn(commentRepo, "updateComment").mockRejectedValue(
      new Error("One or more upload tokens are invalid or expired"),
    );

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new", upload_tokens: ["tok-expired"] },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "One or more upload tokens are invalid or expired" });
  });

  test("forwards upload_tokens to repository", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    } as never);
    const updateSpy = spyOn(commentRepo, "updateComment").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "new",
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new", upload_tokens: ["tok1", "tok2"] },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(updateSpy).toHaveBeenCalledWith("c1", "new", ["tok1", "tok2"], undefined);
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
    const updateSpy = spyOn(commentRepo, "updateComment").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "existing",
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    spyOn(attachmentRepo, "getAttachmentsByCommentId").mockResolvedValue([
      { attachment_id: "a1", gcs_path: "tasks/t1/uuid.jpg" },
    ] as never);
    spyOn(storageService, "deleteFile").mockResolvedValue(undefined);

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { remove_attachment_ids: ["a1"] },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(updateSpy).toHaveBeenCalledWith("c1", undefined, undefined, ["a1"]);
    expect(res.body).toMatchObject({ success: true });
  });

  test("fetches attachments, runs DB update, then deletes GCS files when removing attachments", async () => {
    spyOn(commentRepo, "getCommentById").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "old",
    } as never);
    const updateSpy = spyOn(commentRepo, "updateComment").mockResolvedValue({
      comment_id: "c1",
      user_id: "u1",
      task_id: "t1",
      message: "new",
    } as never);
    spyOn(taskEventRepo, "createTaskEvent").mockResolvedValue({} as never);
    const getAttachmentsSpy = spyOn(attachmentRepo, "getAttachmentsByCommentId").mockResolvedValue([
      { attachment_id: "a1", gcs_path: "tasks/t1/uuid.jpg" },
    ] as never);
    const deleteFileSpy = spyOn(storageService, "deleteFile").mockResolvedValue(undefined);

    const callOrder: string[] = [];
    updateSpy.mockImplementation(async (...args) => {
      callOrder.push("db");
      return { comment_id: "c1", user_id: "u1", task_id: "t1", message: "new" } as never;
    });
    deleteFileSpy.mockImplementation(async () => {
      callOrder.push("gcs");
    });

    const req = createRequest({
      params: { commentId: "c1" } as Request["params"],
      user: { user_id: "u1", role: UserRole.USER },
      body: { message: "new", remove_attachment_ids: ["a1"] },
    });
    const res = createMockResponse();

    await commentController.updateComment(req, res);

    expect(getAttachmentsSpy).toHaveBeenCalledWith("c1");
    expect(deleteFileSpy).toHaveBeenCalledWith("tasks/t1/uuid.jpg");
    expect(callOrder).toEqual(["db", "gcs"]);
  });
});
