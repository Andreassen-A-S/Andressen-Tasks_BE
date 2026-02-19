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
    const req = createRequest();
    const res = createMockResponse();

    await userController.listUsers(req, res);

    expect(res.body).toEqual({ success: true, data: users });
  });
});

describe("userController.getUser", () => {
  test("returns 404 when user not found", async () => {
    spyOn(userRepo, "getUserById").mockResolvedValue(null);
    const req = createRequest({ params: { id: "u1" } as Request["params"] });
    const res = createMockResponse();

    await userController.getUser(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "User not found" });
  });
});

describe("userController.createUser", () => {
  test("creates user when admin", async () => {
    const user = { user_id: "u1", email: "a@a.com" };
    spyOn(userRepo, "createUser").mockResolvedValue(user as never);
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN },
      body: { email: "a@a.com", password: "x" },
    });
    const res = createMockResponse();

    await userController.createUser(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: user });
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
    spyOn(userRepo, "updateUser").mockResolvedValue(user as never);
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      params: { id: "u1" } as Request["params"],
      body: { name: "Updated" },
    });
    const res = createMockResponse();

    await userController.updateUser(req, res);

    expect(res.body).toEqual({ success: true, data: user });
  });

  test("allows admin to update any user", async () => {
    const user = { user_id: "u2", name: "Updated" };
    spyOn(userRepo, "updateUser").mockResolvedValue(user as never);
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN },
      params: { id: "u2" } as Request["params"],
      body: { name: "Updated" },
    });
    const res = createMockResponse();

    await userController.updateUser(req, res);

    expect(res.body).toEqual({ success: true, data: user });
  });

  test("returns 403 when non-admin updates another user", async () => {
    const repoSpy = spyOn(userRepo, "updateUser");
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
    spyOn(userRepo, "deleteUser").mockResolvedValue(undefined as never);
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN },
      params: { id: "u1" } as Request["params"],
    });
    const res = createMockResponse();

    await userController.deleteUser(req, res);

    expect(res.statusCode).toBe(204);
  });

  test("returns 403 when not admin", async () => {
    const repoSpy = spyOn(userRepo, "deleteUser");
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
    spyOn(userRepo, "deleteUser").mockRejectedValue(new Error("missing"));
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN },
      params: { id: "u1" } as Request["params"],
    });
    const res = createMockResponse();

    await userController.deleteUser(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "User not found" });
  });
});
