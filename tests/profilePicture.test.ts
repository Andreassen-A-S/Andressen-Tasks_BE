import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Request, Response } from "express";
import { UserRole } from "../src/generated/prisma/client";
import { errorMiddleware } from "../src/middleware/errorMiddleware";

const userFindFirstMock = mock<(...args: any[]) => Promise<any>>();
const userFindUniqueMock = mock<(...args: any[]) => Promise<any>>();
const userUpdateMock = mock<(...args: any[]) => Promise<any>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    user: {
      findFirst: userFindFirstMock,
      findUnique: userFindUniqueMock,
      update: userUpdateMock,
    },
  },
}));

const generateUserProfilePictureUploadUrlMock = mock<(...args: any[]) => Promise<any>>();
const generateSignedReadUrlMock = mock((path: string) => Promise.resolve(path));

mock.module("../src/services/storageService", () => ({
  ALLOWED_MIME_TYPES: {
    "image/jpeg": { ext: "jpg", maxBytes: 10 * 1024 * 1024 },
    "image/png":  { ext: "png", maxBytes: 10 * 1024 * 1024 },
    "image/webp": { ext: "webp", maxBytes: 10 * 1024 * 1024 },
    "image/heic": { ext: "heic", maxBytes: 10 * 1024 * 1024 },
  },
  generateUserProfilePictureUploadUrl: generateUserProfilePictureUploadUrlMock,
  generateSignedReadUrl: generateSignedReadUrlMock,
}));

mock.module("../src/helper/helpers", () => ({
  hashPassword: mock((p: string) => Promise.resolve(`hashed:${p}`)),
}));

const userController = await import("../src/controllers/userController");

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

type MockResponse = Response & { statusCode?: number; body?: unknown };

function createMockResponse(): MockResponse {
  const res: MockResponse = {} as MockResponse;
  res.status = mock((code: number) => { res.statusCode = code; return res; }) as unknown as Response["status"];
  res.json = mock((payload: unknown) => { res.body = payload; return res; }) as unknown as Response["json"];
  res.send = mock(() => res) as unknown as Response["send"];
  return res;
}

function createRequest(overrides: Record<string, any> = {}): Request {
  return { params: {}, body: {}, ...overrides } as Request;
}

const FAKE_UPLOAD_RESULT = { uploadUrl: "https://storage.example.com/upload", gcsPath: "users/u1/profile.jpg" };

afterEach(() => {
  mock.restore();
  userFindFirstMock.mockReset();
  userFindUniqueMock.mockReset();
  userUpdateMock.mockReset();
  generateUserProfilePictureUploadUrlMock.mockReset();
  generateSignedReadUrlMock.mockReset();
});

describe("prepareProfilePicture — authorization", () => {
  beforeEach(() => {
    generateUserProfilePictureUploadUrlMock.mockResolvedValue(FAKE_UPLOAD_RESULT);
  });

  test("user can prepare their own profile picture when they exist in DB", async () => {
    userFindFirstMock.mockResolvedValue({ user_id: "u1", organization_id: "org1" });
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "u1" },
      body: { mime_type: "image/jpeg", file_size: 1024 },
    });
    const res = createMockResponse();

    await callController(userController.prepareProfilePicture, req, res);

    expect(generateUserProfilePictureUploadUrlMock).toHaveBeenCalledWith("u1", "image/jpeg");
    expect(res.body).toEqual({ success: true, data: { upload_url: FAKE_UPLOAD_RESULT.uploadUrl, gcs_path: FAKE_UPLOAD_RESULT.gcsPath } });
  });

  test("deleted user with stale JWT cannot prepare their own profile picture", async () => {
    userFindFirstMock.mockResolvedValue(null);
    const req = createRequest({
      user: { user_id: "deleted-u1", role: UserRole.USER, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "deleted-u1" },
      body: { mime_type: "image/jpeg", file_size: 1024 },
    });
    const res = createMockResponse();

    await callController(userController.prepareProfilePicture, req, res);

    expect(generateUserProfilePictureUploadUrlMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  test("user cannot prepare profile picture for another user", async () => {
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "u2" },
      body: { mime_type: "image/jpeg", file_size: 1024 },
    });
    const res = createMockResponse();

    await callController(userController.prepareProfilePicture, req, res);

    expect(generateUserProfilePictureUploadUrlMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test("admin can prepare profile picture for user in same org", async () => {
    userFindFirstMock.mockResolvedValue({ user_id: "u2", organization_id: "org1" });
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "u2" },
      body: { mime_type: "image/jpeg", file_size: 1024 },
    });
    const res = createMockResponse();

    await callController(userController.prepareProfilePicture, req, res);

    expect(generateUserProfilePictureUploadUrlMock).toHaveBeenCalledWith("u2", "image/jpeg");
    expect(res.body).toEqual({ success: true, data: { upload_url: FAKE_UPLOAD_RESULT.uploadUrl, gcs_path: FAKE_UPLOAD_RESULT.gcsPath } });
  });

  test("admin cannot prepare profile picture for user in different org", async () => {
    userFindFirstMock.mockResolvedValue(null);
    const req = createRequest({
      user: { user_id: "admin-a", role: UserRole.ADMIN, organization_id: "org-a" },
      effectiveOrgId: "org-a",
      params: { id: "u-org-b" },
      body: { mime_type: "image/jpeg", file_size: 1024 },
    });
    const res = createMockResponse();

    await callController(userController.prepareProfilePicture, req, res);

    expect(generateUserProfilePictureUploadUrlMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  test("scoped super-admin is denied for user outside effective org", async () => {
    userFindFirstMock.mockResolvedValue(null);
    const req = createRequest({
      user: { user_id: "super1", role: UserRole.SUPER_ADMIN, organization_id: null },
      effectiveOrgId: "org-a",
      params: { id: "u-org-b" },
      body: { mime_type: "image/jpeg", file_size: 1024 },
    });
    const res = createMockResponse();

    await callController(userController.prepareProfilePicture, req, res);

    expect(generateUserProfilePictureUploadUrlMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  test("platform super-admin can prepare for an existing user across any org", async () => {
    userFindFirstMock.mockResolvedValue({ user_id: "u-any-org", organization_id: "org-x" });
    const req = createRequest({
      user: { user_id: "super1", role: UserRole.SUPER_ADMIN, organization_id: null },
      effectiveOrgId: null,
      params: { id: "u-any-org" },
      body: { mime_type: "image/jpeg", file_size: 1024 },
    });
    const res = createMockResponse();

    await callController(userController.prepareProfilePicture, req, res);

    expect(userFindFirstMock).toHaveBeenCalled();
    expect(generateUserProfilePictureUploadUrlMock).toHaveBeenCalledWith("u-any-org", "image/jpeg");
    expect(res.body).toEqual({ success: true, data: { upload_url: FAKE_UPLOAD_RESULT.uploadUrl, gcs_path: FAKE_UPLOAD_RESULT.gcsPath } });
  });

  test("platform super-admin is denied when user does not exist", async () => {
    userFindFirstMock.mockResolvedValue(null);
    const req = createRequest({
      user: { user_id: "super1", role: UserRole.SUPER_ADMIN, organization_id: null },
      effectiveOrgId: null,
      params: { id: "ghost-user" },
      body: { mime_type: "image/jpeg", file_size: 1024 },
    });
    const res = createMockResponse();

    await callController(userController.prepareProfilePicture, req, res);

    expect(generateUserProfilePictureUploadUrlMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  test("returns 413 when file exceeds size limit", async () => {
    userFindFirstMock.mockResolvedValue({ user_id: "u1", organization_id: "org1" });
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "u1" },
      body: { mime_type: "image/jpeg", file_size: 11 * 1024 * 1024 },
    });
    const res = createMockResponse();

    await callController(userController.prepareProfilePicture, req, res);

    expect(generateUserProfilePictureUploadUrlMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);
  });
});

describe("updateUser — profile_picture_url path validation", () => {
  test("user can set a valid profile picture path for themselves", async () => {
    userFindFirstMock.mockResolvedValue({ role: UserRole.USER });
    userUpdateMock.mockResolvedValue({ user_id: "u1", profile_picture_url: "users/u1/profile.jpg" });
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "u1" },
      body: { profile_picture_url: "users/u1/profile.jpg" },
    });
    const res = createMockResponse();

    await callController(userController.updateUser, req, res);

    expect(userUpdateMock).toHaveBeenCalled();
    expect(res.body).toMatchObject({ success: true });
  });

  test("updateUser rejects a profile_picture_url that does not match the target user id", async () => {
    userFindFirstMock.mockResolvedValue({ role: UserRole.USER });
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "u1" },
      body: { profile_picture_url: "users/other-user/profile.jpg" },
    });
    const res = createMockResponse();

    await callController(userController.updateUser, req, res);

    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toBe("Invalid profile_picture_url");
  });

  test("updateUser rejects an arbitrary URL as profile_picture_url", async () => {
    userFindFirstMock.mockResolvedValue({ role: UserRole.USER });
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "u1" },
      body: { profile_picture_url: "https://evil.com/malicious.jpg" },
    });
    const res = createMockResponse();

    await callController(userController.updateUser, req, res);

    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toBe("Invalid profile_picture_url");
  });
});
