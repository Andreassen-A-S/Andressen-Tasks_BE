import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { UserRole } from "../src/generated/prisma/client";
import * as authController from "../src/controllers/authController";
import * as authService from "../src/services/authService";

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
  const get = ((name: string) => {
    if (name === "set-cookie") return [] as string[];
    return "test-agent";
  }) as Request["get"];

  return {
    params: {},
    body: {},
    headers: {},
    get,
    ip: "127.0.0.1",
    ...overrides,
  } as Request;
}

afterEach(() => {
  mock.restore();
});

describe("authController.login", () => {
  test("returns 400 when email/password are missing", async () => {
    const req = createRequest({ body: { email: "" } });
    const res = createMockResponse();

    await authController.login(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Email and password are required",
    });
  });

  test("returns auth payload on success", async () => {
    const authResult = {
      token: "jwt",
      user: { user_id: "u1", email: "x@x.com", role: UserRole.USER },
    };
    spyOn(authService, "authenticateUser").mockResolvedValue(
      authResult as never,
    );
    const req = createRequest({ body: { email: "x@x.com", password: "pw" } });
    const res = createMockResponse();

    await authController.login(req, res);

    expect(res.body).toEqual({ success: true, data: authResult });
  });

  test("returns 401 when authentication fails", async () => {
    spyOn(authService, "authenticateUser").mockRejectedValue(
      new Error("Invalid credentials"),
    );
    const req = createRequest({ body: { email: "x@x.com", password: "bad" } });
    const res = createMockResponse();

    await authController.login(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: "Invalid credentials",
    });
  });
});

describe("authController.verifyToken", () => {
  test("returns 401 when token is missing", async () => {
    const req = createRequest({ headers: {} });
    const res = createMockResponse();

    await authController.verifyToken(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "No token provided" });
  });

  test("returns payload on valid token", async () => {
    const payload = {
      user_id: "u1",
      email: "x@x.com",
      role: UserRole.USER,
      name: "x",
    };
    spyOn(authService, "verifyToken").mockReturnValue(payload as never);
    const req = createRequest({
      headers: { authorization: "Bearer valid-token" } as Request["headers"],
    });
    const res = createMockResponse();

    await authController.verifyToken(req, res);

    expect(res.body).toEqual({ success: true, data: payload });
  });

  test("returns 401 for invalid token", async () => {
    spyOn(authService, "verifyToken").mockImplementation(() => {
      throw new Error("invalid token");
    });
    const req = createRequest({
      headers: { authorization: "Bearer bad-token" } as Request["headers"],
    });
    const res = createMockResponse();

    await authController.verifyToken(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Invalid token" });
  });
});
