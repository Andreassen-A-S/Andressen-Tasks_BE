import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import * as userController from "../src/controllers/userController";
import * as userRepo from "../src/repositories/userRepository";

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

function createRequest(overrides: Partial<Request> = {}): Request {
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

    await userController.getUser(req as Request<{ id: string }>, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "User not found" });
  });
});

describe("userController.createUser", () => {
  test("creates user", async () => {
    const user = { user_id: "u1", email: "a@a.com" };
    spyOn(userRepo, "createUser").mockResolvedValue(user as never);
    const req = createRequest({ body: { email: "a@a.com", password: "x" } });
    const res = createMockResponse();

    await userController.createUser(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: user });
  });
});

describe("userController.deleteUser", () => {
  test("returns 404 when delete fails", async () => {
    spyOn(userRepo, "deleteUser").mockRejectedValue(new Error("missing"));
    const req = createRequest({ params: { id: "u1" } as Request["params"] });
    const res = createMockResponse();

    await userController.deleteUser(req as Request<{ id: string }>, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "User not found" });
  });
});
