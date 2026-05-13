import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { authenticateToken, requireAdminOrSuperAdmin, requireSuperAdmin } from "../src/middleware/auth";
import * as authService from "../src/services/authService";
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
  return res;
}

function createRequest(overrides: Record<string, any> = {}): Request {
  return { headers: {}, params: {}, ...overrides } as Request;
}

afterEach(() => {
  mock.restore();
});

describe("authenticateToken", () => {
  test("uses organization_id as effective org for admins", () => {
    spyOn(authService, "verifyToken").mockReturnValue({
      user_id: "admin1",
      email: "admin@test.local",
      name: "Admin",
      role: UserRole.ADMIN,
      organization_id: "org1",
    } as never);
    const req = createRequest({ headers: { authorization: "Bearer token" } });
    const res = createMockResponse();
    const next = mock(() => undefined) as unknown as NextFunction;

    authenticateToken(req, res, next);

    expect(req.effectiveOrgId).toBe("org1");
    expect(next).toHaveBeenCalled();
  });

  test("rejects non-superadmin users without organization_id", () => {
    spyOn(authService, "verifyToken").mockReturnValue({
      user_id: "admin1",
      email: "admin@test.local",
      name: "Admin",
      role: UserRole.ADMIN,
    } as never);
    const req = createRequest({ headers: { authorization: "Bearer token" } });
    const res = createMockResponse();
    const next = mock(() => undefined) as unknown as NextFunction;

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "No organization assigned" });
  });

  test("ignores empty superadmin org context", () => {
    spyOn(authService, "verifyToken").mockReturnValue({
      user_id: "super1",
      email: "super@test.local",
      name: "Super",
      role: UserRole.SUPER_ADMIN,
      organization_id: null,
    } as never);
    const req = createRequest({ headers: { authorization: "Bearer token", "x-org-context": "" } });
    const res = createMockResponse();
    const next = mock(() => undefined) as unknown as NextFunction;

    authenticateToken(req, res, next);

    expect(req.effectiveOrgId).toBeNull();
    expect(next).toHaveBeenCalled();
  });
});

describe("requireSuperAdmin", () => {
  test("rejects admins", () => {
    const req = createRequest({ user: { role: UserRole.ADMIN } });
    const res = createMockResponse();
    const next = mock(() => undefined) as unknown as NextFunction;

    requireSuperAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test("allows superadmins", () => {
    const req = createRequest({ user: { role: UserRole.SUPER_ADMIN } });
    const res = createMockResponse();
    const next = mock(() => undefined) as unknown as NextFunction;

    requireSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe("requireAdminOrSuperAdmin", () => {
  test("allows admin for own organization", () => {
    const req = createRequest({ params: { id: "org1" }, user: { role: UserRole.ADMIN, organization_id: "org1" } });
    const res = createMockResponse();
    const next = mock(() => undefined) as unknown as NextFunction;

    requireAdminOrSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test("rejects admin for another organization", () => {
    const req = createRequest({ params: { id: "org2" }, user: { role: UserRole.ADMIN, organization_id: "org1" } });
    const res = createMockResponse();
    const next = mock(() => undefined) as unknown as NextFunction;

    requireAdminOrSuperAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test("allows superadmin for any organization", () => {
    const req = createRequest({ params: { id: "org2" }, user: { role: UserRole.SUPER_ADMIN, organization_id: null } });
    const res = createMockResponse();
    const next = mock(() => undefined) as unknown as NextFunction;

    requireAdminOrSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
