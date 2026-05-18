import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { getRequestContext } from "../types/requestContext";
import {
  OrganizationSuspendedError,
  OrganizationInactiveError,
  SubscriptionExpiredError,
} from "../errors/domainErrors";
import { OrganizationStatus, SubscriptionStatus } from "../generated/prisma/client";

export async function requireOrgAccess(req: Request, _res: Response, next: NextFunction) {
  const ctx = getRequestContext(req);

  // Unauthenticated requests and super-admins bypass org/subscription checks.
  if (!ctx || ctx.isSuperAdmin) return next();

  // Users with no organization are handled by downstream service guards.
  if (!ctx.actorOrgId) return next();

  const org = await prisma.organization.findUnique({
    where: { org_id: ctx.actorOrgId },
    select: { status: true, subscriptionStatus: true, currentPeriodEnd: true },
  });

  if (!org) return next();

  if (org.status === OrganizationStatus.SUSPENDED) throw new OrganizationSuspendedError();
  if (org.status === OrganizationStatus.INACTIVE) throw new OrganizationInactiveError();

  if (org.subscriptionStatus === SubscriptionStatus.EXPIRED) throw new SubscriptionExpiredError();

  if (
    org.subscriptionStatus === SubscriptionStatus.CANCELED &&
    (!org.currentPeriodEnd || org.currentPeriodEnd < new Date())
  ) {
    throw new SubscriptionExpiredError();
  }

  next();
}
