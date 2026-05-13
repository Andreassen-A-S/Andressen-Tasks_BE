import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import * as userController from "../src/controllers/userController";
import * as userRepo from "../src/repositories/userRepository";
import { UserRole } from "../src/generated/prisma/client";

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

describe("userController.listUsers", () => {
  test("returns users", async () => {
    const users = [{ user_id: "u1" }];
    spyOn(userRepo, "getAllUsers").mockResolvedValue(users as never);
    const req = createRequest({ user: { user_id: "u1", role: UserRole.USER, organization_id: null } });
    const res = createMockResponse();

    await userController.listUsers(req, res);

    expect(res.body).toEqual({ success: true, data: users });
  });

  test("returns 401 when user is missing", async () => {
    const repoSpy = spyOn(userRepo, "getAllUsers");
    const req = createRequest({ user: undefined });
    const res = createMockResponse();

    await userController.listUsers(req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Unauthorized" });
  });
});

describe("userController.getUser", () => {
  test("returns 404 when user not found", async () => {
    spyOn(userRepo, "getUserById").mockResolvedValue(null);
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: null },
      params: { id: "u1" } as Request["params"],
    });
    const res = createMockResponse();

    await userController.getUser(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "User not found" });
  });

  test("returns 401 when user is missing", async () => {
    const repoSpy = spyOn(userRepo, "getUserById");
    const req = createRequest({ user: undefined, params: { id: "u1" } as Request["params"] });
    const res = createMockResponse();

    await userController.getUser(req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Unauthorized" });
  });
});

describe("userController.createUser", () => {
  test("creates user when admin", async () => {
    const user = { user_id: "u1", email: "a@a.com" };
    const createSpy = spyOn(userRepo, "createUser").mockResolvedValue(user as never);
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      body: { email: "a@a.com", password: "x" },
    });
    const res = createMockResponse();

    await userController.createUser(req, res);

    expect(createSpy).toHaveBeenCalledWith({
      name: undefined,
      email: "a@a.com",
      password: "x",
      position: undefined,
      role: UserRole.USER,
      organization_id: "org1",
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: user });
  });

  test("trims organization_id when superadmin creates user", async () => {
    const user = { user_id: "u1", email: "a@a.com" };
    const createSpy = spyOn(userRepo, "createUser").mockResolvedValue(user as never);
    const req = createRequest({
      user: { user_id: "super1", role: UserRole.SUPER_ADMIN, organization_id: null },
      body: { email: "a@a.com", password: "x", organization_id: " org1 " },
    });
    const res = createMockResponse();

    await userController.createUser(req, res);

    expect(createSpy).toHaveBeenCalledWith({
      name: undefined,
      email: "a@a.com",
      password: "x",
      position: undefined,
      role: UserRole.USER,
      organization_id: "org1",
    });
    expect(res.statusCode).toBe(201);
  });

  test("does not allow admin to create superadmin", async () => {
    const createSpy = spyOn(userRepo, "createUser");
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      body: { email: "a@a.com", password: "x", role: UserRole.SUPER_ADMIN },
    });
    const res = createMockResponse();

    await userController.createUser(req, res);

    expect(createSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  test("allows superadmin to create superadmin", async () => {
    const user = { user_id: "u1", email: "a@a.com", role: UserRole.SUPER_ADMIN };
    const createSpy = spyOn(userRepo, "createUser").mockResolvedValue(user as never);
    const req = createRequest({
      user: { user_id: "super1", role: UserRole.SUPER_ADMIN, organization_id: null },
      body: { email: "a@a.com", password: "x", role: UserRole.SUPER_ADMIN, organization_id: "org1" },
    });
    const res = createMockResponse();

    await userController.createUser(req, res);

    expect(createSpy).toHaveBeenCalledWith({
      name: undefined,
      email: "a@a.com",
      password: "x",
      position: undefined,
      role: UserRole.SUPER_ADMIN,
      organization_id: "org1",
    });
    expect(res.statusCode).toBe(201);
  });

  test("returns 403 when not admin", async () => {
    const repoSpy = spyOn(userRepo, "createUser");
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      body: { email: "a@a.com", password: "x" },
    });
    const res = createMockResponse();

    await userController.createUser(req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "Forbidden" });
  });
});

describe("userController.updateUser", () => {
  test("allows user to update themselves", async () => {
    const user = { user_id: "u1", name: "Updated" };
    const updateSpy = spyOn(userRepo, "updateUserInOrg").mockResolvedValue(user as never);
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
      params: { id: "u1" } as Request["params"],
      body: { name: "Updated" },
    });
    const res = createMockResponse();

    await userController.updateUser(req, res);

    expect(updateSpy).toHaveBeenCalledWith("u1", "org1", { name: "Updated" });
    expect(res.body).toEqual({ success: true, data: user });
  });

  test("allows admin to update user in own organization", async () => {
    const user = { user_id: "u2", name: "Updated" };
    const updateSpy = spyOn(userRepo, "updateUserInOrg").mockResolvedValue(user as never);
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "u2" } as Request["params"],
      body: { name: "Updated" },
    });
    const res = createMockResponse();

    await userController.updateUser(req, res);

    expect(updateSpy).toHaveBeenCalledWith("u2", "org1", { name: "Updated" });
    expect(res.body).toEqual({ success: true, data: user });
  });

  test("admin from org A cannot update user from org B", async () => {
    const updateSpy = spyOn(userRepo, "updateUserInOrg").mockRejectedValue(new Error("User not found"));
    const req = createRequest({
      user: { user_id: "admin-a", role: UserRole.ADMIN, organization_id: "org-a" },
      effectiveOrgId: "org-a",
      params: { id: "user-org-b" } as Request["params"],
      body: { name: "Hacked" },
    });
    const res = createMockResponse();

    await userController.updateUser(req, res);

    expect(updateSpy).toHaveBeenCalledWith("user-org-b", "org-a", { name: "Hacked" });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "User not found or update failed" });
  });

  test("superadmin with org context is scoped to that organization on update", async () => {
    const user = { user_id: "u2", name: "Updated" };
    const updateSpy = spyOn(userRepo, "updateUserInOrg").mockResolvedValue(user as never);
    const req = createRequest({
      user: { user_id: "super1", role: UserRole.SUPER_ADMIN, organization_id: null },
      effectiveOrgId: "org-a",
      params: { id: "u2" } as Request["params"],
      body: { name: "Updated" },
    });
    const res = createMockResponse();

    await userController.updateUser(req, res);

    expect(updateSpy).toHaveBeenCalledWith("u2", "org-a", { name: "Updated" });
    expect(res.body).toEqual({ success: true, data: user });
  });

  test("superadmin without org context can update globally", async () => {
    const user = { user_id: "u2", name: "Updated" };
    const updateSpy = spyOn(userRepo, "updateUserPlatform").mockResolvedValue(user as never);
    const req = createRequest({
      user: { user_id: "super1", role: UserRole.SUPER_ADMIN, organization_id: null },
      effectiveOrgId: null,
      params: { id: "u2" } as Request["params"],
      body: { name: "Updated" },
    });
    const res = createMockResponse();

    await userController.updateUser(req, res);

    expect(updateSpy).toHaveBeenCalledWith("u2", { name: "Updated" });
    expect(res.body).toEqual({ success: true, data: user });
  });

  test("returns 403 when non-admin updates another user", async () => {
    const repoSpy = spyOn(userRepo, "updateUserInOrg");
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      params: { id: "u2" } as Request["params"],
      body: { name: "Hacked" },
    });
    const res = createMockResponse();

    await userController.updateUser(req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "Forbidden" });
  });
});

describe("userController.deleteUser", () => {
  test("deletes user when admin", async () => {
    const deleteSpy = spyOn(userRepo, "deleteUserInOrg").mockResolvedValue(undefined as never);
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "u1" } as Request["params"],
    });
    const res = createMockResponse();

    await userController.deleteUser(req, res);

    expect(deleteSpy).toHaveBeenCalledWith("u1", "org1");
    expect(res.statusCode).toBe(204);
  });

  test("returns 403 when not admin", async () => {
    const repoSpy = spyOn(userRepo, "deleteUserInOrg");
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      params: { id: "u1" } as Request["params"],
    });
    const res = createMockResponse();

    await userController.deleteUser(req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "Forbidden" });
  });

  test("returns 404 when delete fails", async () => {
    spyOn(userRepo, "deleteUserInOrg").mockRejectedValue(new Error("missing"));
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      params: { id: "u1" } as Request["params"],
    });
    const res = createMockResponse();

    await userController.deleteUser(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "User not found" });
  });

  test("admin from org A cannot delete user from org B", async () => {
    const deleteSpy = spyOn(userRepo, "deleteUserInOrg").mockRejectedValue(new Error("User not found"));
    const req = createRequest({
      user: { user_id: "admin-a", role: UserRole.ADMIN, organization_id: "org-a" },
      effectiveOrgId: "org-a",
      params: { id: "user-org-b" } as Request["params"],
    });
    const res = createMockResponse();

    await userController.deleteUser(req, res);

    expect(deleteSpy).toHaveBeenCalledWith("user-org-b", "org-a");
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "User not found" });
  });

  test("superadmin without org context can delete globally", async () => {
    const deleteSpy = spyOn(userRepo, "deleteUserPlatform").mockResolvedValue(undefined as never);
    const req = createRequest({
      user: { user_id: "super1", role: UserRole.SUPER_ADMIN, organization_id: null },
      effectiveOrgId: null,
      params: { id: "u1" } as Request["params"],
    });
    const res = createMockResponse();

    await userController.deleteUser(req, res);

    expect(deleteSpy).toHaveBeenCalledWith("u1");
    expect(res.statusCode).toBe(204);
  });
});
