import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { UserRole } from "../src/generated/prisma/client";
import * as attachmentRepo from "../src/repositories/attachmentRepository";
import * as storageService from "../src/services/storageService";

const findUniqueMock = mock<(...args: any[]) => Promise<any>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    task: {
      findUnique: findUniqueMock,
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
    ...overrides,
  } as Request;
}

afterEach(() => {
  mock.restore();
});

describe("attachmentController.getUploadUrl", () => {
  test("returns 400 when required fields are missing", async () => {
    const req = createRequest({ body: { task_id: "t1", file_name: "photo.jpg" } });
    const res = createMockResponse();

    await attachmentController.getUploadUrl(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "task_id, file_name, and mime_type are required" });
  });

  test("returns 400 for unsupported mime type", async () => {
    const req = createRequest({
      body: { task_id: "t1", file_name: "doc.pdf", mime_type: "application/pdf" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await attachmentController.getUploadUrl(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Unsupported file type" });
  });

  test("returns 401 when user is not authenticated", async () => {
    const req = createRequest({ body: { task_id: "t1", file_name: "photo.jpg", mime_type: "image/jpeg" } });
    const res = createMockResponse();

    await attachmentController.getUploadUrl(req, res);

    expect(res.statusCode).toBe(401);
  });

  test("returns 404 when task does not exist", async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const req = createRequest({
      body: { task_id: "t1", file_name: "photo.jpg", mime_type: "image/jpeg" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await attachmentController.getUploadUrl(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found" });
  });

  test("returns 403 when user has no access to task", async () => {
    findUniqueMock.mockResolvedValueOnce({ task_id: "t1", created_by: "other", assignments: [] });

    const req = createRequest({
      body: { task_id: "t1", file_name: "photo.jpg", mime_type: "image/jpeg" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await attachmentController.getUploadUrl(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "Access denied" });
  });

  test("returns 413 when file_size exceeds 10 MB", async () => {
    const req = createRequest({
      body: {
        task_id: "t1",
        file_name: "photo.jpg",
        mime_type: "image/jpeg",
        file_size: 11 * 1024 * 1024,
      },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await attachmentController.getUploadUrl(req, res);

    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ success: false, error: "File exceeds maximum size of 10 MB" });
  });

  test("returns 200 with upload URL when file_size is exactly 10 MB", async () => {
    findUniqueMock.mockResolvedValueOnce({ task_id: "t1", created_by: "u1", assignments: [] });
    spyOn(storageService, "generateSignedUploadUrl").mockResolvedValue({
      uploadUrl: "https://storage.googleapis.com/signed",
      gcsPath: "tasks/t1/uuid.jpg",
      publicUrl: "https://storage.googleapis.com/bucket/tasks/t1/uuid.jpg",
    });

    const req = createRequest({
      body: {
        task_id: "t1",
        file_name: "photo.jpg",
        mime_type: "image/jpeg",
        file_size: 10 * 1024 * 1024,
      },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await attachmentController.getUploadUrl(req, res);

    expect(res.statusCode).toBeUndefined(); // 200 implicit
    expect(res.body).toMatchObject({ success: true, data: { uploadUrl: "https://storage.googleapis.com/signed" } });
  });

  test("returns upload URL when file_size is omitted", async () => {
    findUniqueMock.mockResolvedValueOnce({ task_id: "t1", created_by: "u1", assignments: [] });
    spyOn(storageService, "generateSignedUploadUrl").mockResolvedValue({
      uploadUrl: "https://storage.googleapis.com/signed",
      gcsPath: "tasks/t1/uuid.jpg",
      publicUrl: "https://storage.googleapis.com/bucket/tasks/t1/uuid.jpg",
    });

    const req = createRequest({
      body: { task_id: "t1", file_name: "photo.jpg", mime_type: "image/jpeg" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await attachmentController.getUploadUrl(req, res);

    expect(res.statusCode).toBeUndefined();
    expect(res.body).toMatchObject({ success: true });
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

    await attachmentController.deleteAttachment(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Attachment not found" });
  });

  test("returns 403 when non-owner non-admin tries to delete", async () => {
    spyOn(attachmentRepo, "getAttachmentById").mockResolvedValue({
      attachment_id: "a1",
      uploaded_by: "owner",
      gcs_path: "tasks/t1/uuid.jpg",
    } as never);

    const req = createRequest({
      params: { attachmentId: "a1" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await attachmentController.deleteAttachment(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "Access denied" });
  });

  test("deletes attachment when user is the uploader", async () => {
    spyOn(attachmentRepo, "getAttachmentById").mockResolvedValue({
      attachment_id: "a1",
      uploaded_by: "u1",
      gcs_path: "tasks/t1/uuid.jpg",
    } as never);
    const deleteSpy = spyOn(storageService, "deleteFile").mockResolvedValue(undefined);
    const repoDeleteSpy = spyOn(attachmentRepo, "deleteAttachment").mockResolvedValue(undefined as never);

    const req = createRequest({
      params: { attachmentId: "a1" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await attachmentController.deleteAttachment(req, res);

    expect(deleteSpy).toHaveBeenCalledWith("tasks/t1/uuid.jpg");
    expect(repoDeleteSpy).toHaveBeenCalledWith("a1");
    expect(res.statusCode).toBe(204);
  });

  test("allows admin to delete any attachment", async () => {
    spyOn(attachmentRepo, "getAttachmentById").mockResolvedValue({
      attachment_id: "a1",
      uploaded_by: "other-user",
      gcs_path: "tasks/t1/uuid.jpg",
    } as never);
    spyOn(storageService, "deleteFile").mockResolvedValue(undefined);
    spyOn(attachmentRepo, "deleteAttachment").mockResolvedValue(undefined as never);

    const req = createRequest({
      params: { attachmentId: "a1" },
      user: { user_id: "admin1", role: UserRole.ADMIN },
    });
    const res = createMockResponse();

    await attachmentController.deleteAttachment(req, res);

    expect(res.statusCode).toBe(204);
  });
});

describe("attachmentController.getTaskImages", () => {
  test("returns 403 when user has no access to task", async () => {
    findUniqueMock.mockResolvedValueOnce({ task_id: "t1", created_by: "other", assignments: [] });

    const req = createRequest({
      params: { taskId: "t1" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await attachmentController.getTaskImages(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "Access denied" });
  });

  test("returns images with signed URLs for task creator", async () => {
    findUniqueMock.mockResolvedValueOnce({ task_id: "t1", created_by: "u1", assignments: [] });
    spyOn(attachmentRepo, "getImageAttachmentsByTaskId").mockResolvedValue([
      { attachment_id: "a1", gcs_path: "tasks/t1/uuid.jpg", public_url: "old" } as never,
    ]);
    spyOn(storageService, "generateSignedReadUrl").mockResolvedValue("https://signed-read-url");

    const req = createRequest({
      params: { taskId: "t1" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await attachmentController.getTaskImages(req, res);

    expect(res.statusCode).toBeUndefined();
    expect(res.body).toMatchObject({
      success: true,
      data: [{ attachment_id: "a1", public_url: "https://signed-read-url" }],
    });
  });

  test("returns images for assignee", async () => {
    findUniqueMock.mockResolvedValueOnce({
      task_id: "t1",
      created_by: "other",
      assignments: [{ user_id: "u1" }],
    });
    spyOn(attachmentRepo, "getImageAttachmentsByTaskId").mockResolvedValue([]);

    const req = createRequest({
      params: { taskId: "t1" },
      user: { user_id: "u1", role: UserRole.USER },
    });
    const res = createMockResponse();

    await attachmentController.getTaskImages(req, res);

    expect(res.statusCode).toBeUndefined();
    expect(res.body).toMatchObject({ success: true, data: [] });
  });
});
