import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { UserRole } from "../src/generated/prisma/client";
import * as attachmentRepo from "../src/repositories/attachmentRepository";
import * as storageService from "../src/services/storageService";
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

// attachmentService uses prisma.task.findFirst for access control.
const findFirstMock = mock<(...args: any[]) => Promise<any>>(() =>
  Promise.resolve({ task_id: "t1", status: "PENDING", created_by: "u1", assignments: [] }),
);

mock.module("../src/db/prisma", () => ({
  prisma: {
    task: {
      findFirst: findFirstMock,
    },
  },
}));

const attachmentController = await import("../src/controllers/attachmentController");

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
    ...overrides,
  } as Request;
}

afterEach(() => {
  mock.restore();
});

describe("attachmentController.prepareAttachments", () => {
  test("returns 401 when user is not authenticated", async () => {
    const req = createRequest({
      body: { task_id: "t1", files: [{ file_name: "photo.jpg", mime_type: "image/jpeg", file_size: 1024 }] },
    });
    const res = createMockResponse();

    await callController(attachmentController.prepareAttachments, req, res);

    expect(res.statusCode).toBe(401);
  });


  test("accepts exactly 20 files", async () => {
    findFirstMock.mockResolvedValueOnce({ task_id: "t1", status: "PENDING", created_by: "u1", assignments: [] });
    spyOn(storageService, "generateSignedUploadUrl").mockResolvedValue({
      uploadUrl: "https://storage.googleapis.com/signed",
      gcsPath: "tasks/t1/uuid.jpg",
      url: "https://storage.googleapis.com/bucket/tasks/t1/uuid",
    });
    spyOn(attachmentRepo, "prepareAttachment").mockResolvedValue({ upload_token: "tok1", attachment_id: "a1" } as { upload_token: string; attachment_id: string });

    const req = createRequest({
      body: {
        task_id: "t1",
        files: Array.from({ length: 20 }, (_, i) => ({ file_name: `photo_${i}.jpg`, mime_type: "image/jpeg", file_size: 1024 })),
      },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.prepareAttachments, req, res);

    expect(res.statusCode).toBeUndefined();
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.data[0]).toMatchObject({ upload_token: "tok1" });
  });


  test("returns 413 when file exceeds size limit for its mime type", async () => {
    findFirstMock.mockResolvedValueOnce({ task_id: "t1", status: "PENDING", created_by: "u1", assignments: [] });

    const req = createRequest({
      body: { task_id: "t1", files: [{ file_name: "photo.jpg", mime_type: "image/jpeg", file_size: 11 * 1024 * 1024 }] },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.prepareAttachments, req, res);

    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ success: false, error: "File exceeds maximum size of 10 MB" });
  });

  test.each([
    ["application/pdf", "doc.pdf"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "doc.docx"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "sheet.xlsx"],
  ])("allows %s files through validation", async (mimeType, fileName) => {
    findFirstMock.mockResolvedValueOnce({ task_id: "t1", status: "PENDING", created_by: "u1", assignments: [] });
    spyOn(storageService, "generateSignedUploadUrl").mockResolvedValue({
      uploadUrl: "https://storage.googleapis.com/signed",
      gcsPath: `tasks/t1/uuid.${fileName.split(".").pop()}`,
      url: "https://storage.googleapis.com/bucket/tasks/t1/uuid",
    });
    spyOn(attachmentRepo, "prepareAttachment").mockResolvedValue({ upload_token: "tok1", attachment_id: "a1" } as never);

    const req = createRequest({
      body: { task_id: "t1", files: [{ file_name: fileName, mime_type: mimeType, file_size: 1024 }] },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.prepareAttachments, req, res);

    expect(res.statusCode).toBeUndefined();
    expect(res.body).toMatchObject({ success: true, data: [{ upload_token: "tok1" }] });
  });


  test("returns 404 when task does not exist", async () => {
    findFirstMock.mockResolvedValueOnce(null);

    const req = createRequest({
      body: { task_id: "t1", files: [{ file_name: "photo.jpg", mime_type: "image/jpeg", file_size: 1024 }] },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.prepareAttachments, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found: t1" });
  });

  test("returns 403 when user has no access to task", async () => {
    findFirstMock.mockResolvedValueOnce({ task_id: "t1", status: "PENDING", created_by: "other", assignments: [] });

    const req = createRequest({
      body: { task_id: "t1", files: [{ file_name: "photo.jpg", mime_type: "image/jpeg", file_size: 1024 }] },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.prepareAttachments, req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "You do not have access to this task" });
  });

  test("returns upload tokens and signed URLs on success", async () => {
    findFirstMock.mockResolvedValueOnce({ task_id: "t1", status: "PENDING", created_by: "u1", assignments: [] });
    spyOn(storageService, "generateSignedUploadUrl").mockResolvedValue({
      uploadUrl: "https://storage.googleapis.com/signed",
      gcsPath: "tasks/t1/uuid.jpg",
      url: "https://storage.googleapis.com/bucket/tasks/t1/uuid.jpg",
    });
    const prepareSpy = spyOn(attachmentRepo, "prepareAttachment").mockResolvedValue({ upload_token: "tok1" } as never);

    const req = createRequest({
      body: {
        task_id: "t1",
        files: [{
          file_name: "photo.jpg",
          mime_type: "image/jpeg",
          file_size: 1024,
          width: 1920,
          height: 1080,
        }],
      },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.prepareAttachments, req, res);

    expect(res.statusCode).toBeUndefined();
    expect(res.body).toMatchObject({
      success: true,
      data: [{ upload_token: "tok1", upload_url: "https://storage.googleapis.com/signed" }],
    });
    expect(prepareSpy).toHaveBeenCalledWith(expect.objectContaining({
      width: 1920,
      height: 1080,
    }));
  });
});

describe("attachmentController.deleteAttachment", () => {
  test("returns 404 when attachment does not exist", async () => {
    spyOn(attachmentRepo, "getAttachmentById").mockResolvedValue(null as never);

    const req = createRequest({
      params: { attachmentId: "a1" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.deleteAttachment, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Attachment not found" });
  });

  test("returns 403 when non-owner non-admin tries to delete", async () => {
    spyOn(attachmentRepo, "getAttachmentById").mockResolvedValue({
      attachment_id: "a1",
      uploaded_by: "owner",
      task_id: "t1",
      gcs_path: "tasks/t1/uuid.jpg",
    } as never);
    // attachmentService checks task status
    findFirstMock.mockResolvedValueOnce({ status: "PENDING" } as any);

    const req = createRequest({
      params: { attachmentId: "a1" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.deleteAttachment, req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "You do not have access to this task" });
  });

  test("deletes attachment when user is the uploader", async () => {
    spyOn(attachmentRepo, "getAttachmentById").mockResolvedValue({
      attachment_id: "a1",
      uploaded_by: "u1",
      task_id: "t1",
      gcs_path: "tasks/t1/uuid.jpg",
    } as never);
    findFirstMock.mockResolvedValueOnce({ status: "PENDING" } as any);
    const deleteSpy = spyOn(storageService, "deleteFile").mockResolvedValue(undefined);
    const repoDeleteSpy = spyOn(attachmentRepo, "deleteAttachment").mockResolvedValue(undefined as never);

    const req = createRequest({
      params: { attachmentId: "a1" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.deleteAttachment, req, res);

    expect(deleteSpy).toHaveBeenCalledWith("tasks/t1/uuid.jpg");
    expect(repoDeleteSpy).toHaveBeenCalledWith("a1");
    expect(res.statusCode).toBe(204);
  });

  test("allows admin to delete any attachment", async () => {
    spyOn(attachmentRepo, "getAttachmentById").mockResolvedValue({
      attachment_id: "a1",
      uploaded_by: "other-user",
      task_id: "t1",
      gcs_path: "tasks/t1/uuid.jpg",
    } as never);
    findFirstMock.mockResolvedValueOnce({ status: "PENDING" } as any);
    spyOn(storageService, "deleteFile").mockResolvedValue(undefined);
    spyOn(attachmentRepo, "deleteAttachment").mockResolvedValue(undefined as never);

    const req = createRequest({
      params: { attachmentId: "a1" },
      user: { user_id: "admin1", role: UserRole.ADMIN },
    });
    const res = createMockResponse();

    await callController(attachmentController.deleteAttachment, req, res);

    expect(res.statusCode).toBe(204);
  });
});

describe("attachmentController.getTaskAttachments", () => {
  test("returns 403 when user has no access to task", async () => {
    findFirstMock.mockResolvedValueOnce({ task_id: "t1", status: "PENDING", created_by: "other", assignments: [] });

    const req = createRequest({
      params: { taskId: "t1" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.getTaskAttachments, req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "You do not have access to this task" });
  });

  test("returns attachments with signed URLs for task creator", async () => {
    findFirstMock.mockResolvedValueOnce({ task_id: "t1", status: "PENDING", created_by: "u1", assignments: [] });
    spyOn(attachmentRepo, "getAttachmentsByTaskId").mockResolvedValue([
      { attachment_id: "a1", gcs_path: "tasks/t1/uuid.jpg", url: "old" } as never,
    ]);
    spyOn(storageService, "generateSignedReadUrl").mockResolvedValue("https://signed-read-url");

    const req = createRequest({
      params: { taskId: "t1" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.getTaskAttachments, req, res);

    expect(res.statusCode).toBeUndefined();
    expect(res.body).toMatchObject({
      success: true,
      data: [{ attachment_id: "a1", url: "https://signed-read-url" }],
    });
  });

  test("returns attachments for assignee", async () => {
    findFirstMock.mockResolvedValueOnce({
      task_id: "t1",
      status: "PENDING",
      created_by: "other",
      assignments: [{ user_id: "u1" }],
    });
    spyOn(attachmentRepo, "getAttachmentsByTaskId").mockResolvedValue([]);

    const req = createRequest({
      params: { taskId: "t1" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await callController(attachmentController.getTaskAttachments, req, res);

    expect(res.statusCode).toBeUndefined();
    expect(res.body).toMatchObject({ success: true, data: [] });
  });
});
