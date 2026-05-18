import { describe, expect, mock, test } from "bun:test";
import type { Request, Response, NextFunction } from "express";
import { OrganizationStatus, SubscriptionStatus, UserRole } from "../src/generated/prisma/client";
import {
  OrganizationSuspendedError,
  OrganizationInactiveError,
  SubscriptionExpiredError,
} from "../src/errors/domainErrors";

const findUniqueMock = mock<(...args: any[]) => Promise<any>>(() => Promise.resolve(null));

mock.module("../src/db/prisma", () => ({
  prisma: { organization: { findUnique: findUniqueMock } },
}));

const { requireOrgAccess } = await import("../src/middleware/orgAccess");

function makeReq(overrides: Record<string, any> = {}): Request {
  return {
    user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
    ...overrides,
  } as Request;
}

const res = {} as Response;

async function run(req: Request): Promise<{ next: boolean; error: unknown }> {
  let called = false;
  let captured: unknown = undefined;
  const next: NextFunction = (err?: unknown) => {
    called = true;
    captured = err;
  };
  await requireOrgAccess(req, res, next);
  return { next: called, error: captured };
}

describe("requireOrgAccess", () => {
  test("bypasses check when request has no user (unauthenticated)", async () => {
    const { next, error } = await run({ ...makeReq(), user: undefined } as any);
    expect(next).toBe(true);
    expect(error).toBeUndefined();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  test("bypasses check for SUPER_ADMIN", async () => {
    const req = makeReq({ user: { user_id: "sa", role: UserRole.SUPER_ADMIN, organization_id: "org1" } });
    const { next } = await run(req);
    expect(next).toBe(true);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  test("bypasses check when user has no organization", async () => {
    const req = makeReq({ user: { user_id: "u1", role: UserRole.USER, organization_id: null } });
    const { next } = await run(req);
    expect(next).toBe(true);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  test("bypasses check when org is not found", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const { next } = await run(makeReq());
    expect(next).toBe(true);
  });

  test("allows access when org is ACTIVE and subscription is ACTIVE", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: OrganizationStatus.ACTIVE,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
    });
    const { next, error } = await run(makeReq());
    expect(next).toBe(true);
    expect(error).toBeUndefined();
  });

  test("allows access when subscription is TRIALING", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: OrganizationStatus.ACTIVE,
      subscriptionStatus: SubscriptionStatus.TRIALING,
      currentPeriodEnd: null,
    });
    const { next, error } = await run(makeReq());
    expect(next).toBe(true);
    expect(error).toBeUndefined();
  });

  test("allows access when subscription is PAST_DUE", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: OrganizationStatus.ACTIVE,
      subscriptionStatus: SubscriptionStatus.PAST_DUE,
      currentPeriodEnd: null,
    });
    const { next, error } = await run(makeReq());
    expect(next).toBe(true);
    expect(error).toBeUndefined();
  });

  test("allows access when subscription is CANCELED but period has not ended", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: OrganizationStatus.ACTIVE,
      subscriptionStatus: SubscriptionStatus.CANCELED,
      currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const { next, error } = await run(makeReq());
    expect(next).toBe(true);
    expect(error).toBeUndefined();
  });

  test("throws OrganizationSuspendedError when org is SUSPENDED", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: OrganizationStatus.SUSPENDED,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
    });
    await expect(run(makeReq())).rejects.toBeInstanceOf(OrganizationSuspendedError);
  });

  test("throws OrganizationInactiveError when org is INACTIVE", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: OrganizationStatus.INACTIVE,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
    });
    await expect(run(makeReq())).rejects.toBeInstanceOf(OrganizationInactiveError);
  });

  test("throws SubscriptionExpiredError when subscription is EXPIRED", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: OrganizationStatus.ACTIVE,
      subscriptionStatus: SubscriptionStatus.EXPIRED,
      currentPeriodEnd: null,
    });
    await expect(run(makeReq())).rejects.toBeInstanceOf(SubscriptionExpiredError);
  });

  test("throws SubscriptionExpiredError when CANCELED and period has ended", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: OrganizationStatus.ACTIVE,
      subscriptionStatus: SubscriptionStatus.CANCELED,
      currentPeriodEnd: new Date(Date.now() - 1000),
    });
    await expect(run(makeReq())).rejects.toBeInstanceOf(SubscriptionExpiredError);
  });

  test("throws SubscriptionExpiredError when CANCELED and no currentPeriodEnd", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: OrganizationStatus.ACTIVE,
      subscriptionStatus: SubscriptionStatus.CANCELED,
      currentPeriodEnd: null,
    });
    await expect(run(makeReq())).rejects.toBeInstanceOf(SubscriptionExpiredError);
  });
});
