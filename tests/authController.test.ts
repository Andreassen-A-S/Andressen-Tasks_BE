import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { UserRole } from "../src/generated/prisma/client";
import * as authController from "../src/controllers/authController";
import * as authService from "../src/services/authService";
import { AuthenticationError, UserTerminatedError } from "../src/errors/domainErrors";
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

  res.cookie = mock(() => res) as unknown as Response["cookie"];
  res.clearCookie = mock(() => res) as unknown as Response["clearCookie"];

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
    cookies: {},
    get,
    ip: "127.0.0.1",
    ...overrides,
  } as Request;
}

const mockUser = { user_id: "u1", email: "x@x.com", role: UserRole.USER };
const mockSavedAccounts = [mockUser];

afterEach(() => {
  mock.restore();
});

describe("authController.login (web)", () => {
  test("returns auth payload and sets session cookie on success", async () => {
    const webResult = { token: "jwt", user: mockUser, sessionId: "sid1", savedAccounts: mockSavedAccounts };
    spyOn(authService, "authenticateWebUser").mockResolvedValue(webResult as never);
    const req = createRequest({
      body: { email: "x@x.com", password: "pw" },
      headers: { "x-client": "browser" },
      cookies: {},
    });
    const res = createMockResponse();

    await callController(authController.login, req, res);

    expect(res.body).toEqual({ success: true, data: { token: "jwt", user: mockUser, savedAccounts: mockSavedAccounts } });
    expect(res.cookie).toHaveBeenCalledWith("session_id", "sid1", expect.any(Object));
  });

  test("returns 401 when authentication fails", async () => {
    spyOn(authService, "authenticateWebUser").mockRejectedValue(
      new AuthenticationError("Invalid credentials"),
    );
    const req = createRequest({
      body: { email: "x@x.com", password: "bad" },
      headers: { "x-client": "browser" },
      cookies: {},
    });
    const res = createMockResponse();

    await callController(authController.login, req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Invalid credentials" });
  });

  test("returns 403 when user is terminated", async () => {
    spyOn(authService, "authenticateWebUser").mockRejectedValue(new UserTerminatedError());
    const req = createRequest({
      body: { email: "x@x.com", password: "pw" },
      headers: { "x-client": "browser" },
      cookies: {},
    });
    const res = createMockResponse();

    await callController(authController.login, req, res);

    expect(res.statusCode).toBe(403);
  });
});

describe("authController.login (mobile)", () => {
  test("returns token and refresh_token without session cookie", async () => {
    const mobileResult = { token: "jwt", refresh_token: "raw-refresh", user: mockUser };
    spyOn(authService, "authenticateUser").mockResolvedValue(mobileResult as never);
    const req = createRequest({ body: { email: "x@x.com", password: "pw" }, headers: {}, cookies: {} });
    const res = createMockResponse();

    await callController(authController.login, req, res);

    expect(res.body).toEqual({ success: true, data: mobileResult });
    expect(res.cookie).not.toHaveBeenCalledWith("session_id", expect.anything(), expect.anything());
  });
});

describe("authController.refresh (web)", () => {
  test("returns new token when valid session cookie present", async () => {
    const result = { token: "new-jwt", user: mockUser, savedAccounts: mockSavedAccounts };
    spyOn(authService, "refreshWebSession").mockResolvedValue(result as never);
    const req = createRequest({ cookies: { session_id: "sid1" }, body: {} });
    const res = createMockResponse();

    await callController(authController.refresh, req, res);

    expect(authService.refreshWebSession).toHaveBeenCalledWith("sid1");
    expect(res.body).toEqual({ success: true, data: result });
  });

  test("returns 401 when session is expired", async () => {
    spyOn(authService, "refreshWebSession").mockRejectedValue(
      new AuthenticationError("Session expired or invalid"),
    );
    const req = createRequest({ cookies: { session_id: "bad" }, body: {} });
    const res = createMockResponse();

    await callController(authController.refresh, req, res);

    expect(res.statusCode).toBe(401);
  });
});

describe("authController.refresh (mobile)", () => {
  test("returns 400 when no token provided", async () => {
    const req = createRequest({ body: {}, cookies: {} });
    const res = createMockResponse();

    await callController(authController.refresh, req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Missing refresh token" });
  });

  test("returns new tokens from body refresh token", async () => {
    const result = { token: "new-jwt", refresh_token: "new-raw", user: mockUser };
    spyOn(authService, "refreshTokens").mockResolvedValue(result as never);
    const req = createRequest({ body: { refresh_token: "old-raw" }, cookies: {} });
    const res = createMockResponse();

    await callController(authController.refresh, req, res);

    expect(authService.refreshTokens).toHaveBeenCalledWith("old-raw");
    expect(res.body).toEqual({ success: true, data: result });
  });
});

describe("authController.switchAccount", () => {
  test("returns 401 when no session cookie", async () => {
    const req = createRequest({ body: { user_id: "u2" }, cookies: {} });
    const res = createMockResponse();

    await callController(authController.switchAccount, req, res);

    expect(res.statusCode).toBe(401);
  });

  test("returns 400 when user_id missing", async () => {
    const req = createRequest({ body: {}, cookies: { session_id: "sid1" } });
    const res = createMockResponse();

    await callController(authController.switchAccount, req, res);

    expect(res.statusCode).toBe(400);
  });

  test("returns new token on successful switch", async () => {
    const result = { token: "new-jwt", user: mockUser, savedAccounts: mockSavedAccounts };
    spyOn(authService, "switchAccount").mockResolvedValue(result as never);
    const req = createRequest({ body: { user_id: "u2" }, cookies: { session_id: "sid1" } });
    const res = createMockResponse();

    await callController(authController.switchAccount, req, res);

    expect(authService.switchAccount).toHaveBeenCalledWith("sid1", "u2");
    expect(res.body).toEqual({ success: true, data: result });
  });
});

describe("authController.logout", () => {
  test("revokes web session and clears cookie", async () => {
    spyOn(authService, "logoutWebSession").mockResolvedValue(undefined);
    const req = createRequest({ cookies: { session_id: "sid1" }, body: {} });
    const res = createMockResponse();

    await callController(authController.logout, req, res);

    expect(authService.logoutWebSession).toHaveBeenCalledWith("sid1");
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.body).toEqual({ success: true });
  });

  test("revokes mobile token from body", async () => {
    spyOn(authService, "logout").mockResolvedValue(undefined);
    const req = createRequest({ body: { refresh_token: "raw" }, cookies: {} });
    const res = createMockResponse();

    await callController(authController.logout, req, res);

    expect(authService.logout).toHaveBeenCalledWith("raw");
    expect(res.body).toEqual({ success: true });
  });

  test("succeeds with no token at all", async () => {
    const req = createRequest({ body: {}, cookies: {} });
    const res = createMockResponse();

    await callController(authController.logout, req, res);

    expect(res.body).toEqual({ success: true });
  });
});
