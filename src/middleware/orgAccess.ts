import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { getRequestContext } from "../types/requestContext";
import {
  OrganizationSuspendedError,
  OrganizationInactiveError,
  SubscriptionExpiredError,
  UserTerminatedError,
} from "../errors/domainErrors";
import { OrganizationStatus, SubscriptionStatus, UserStatus } from "../generated/prisma/client";

export async function requireOrgAccess(req: Request, _res: Response, next: NextFunction) {
  const ctx = getRequestContext(req);

  // Unauthenticated requests bypass all checks.
  if (!ctx) return next();

  const needsOrgCheck = !ctx.isSuperAdmin && !!ctx.actorOrgId;

  // Run user and org lookups in parallel; org lookup is skipped for super-admins
  // and users with no organization.
  const [user, org] = await Promise.all([
    prisma.user.findUnique({
      where: { user_id: ctx.actorUserId },
      select: { status: true },
    }),
    needsOrgCheck
      ? prisma.organization.findUnique({
          where: { org_id: ctx.actorOrgId! },
          select: { status: true, subscription_status: true, current_period_end: true },
        })
      : Promise.resolve(null),
  ]);

  if (user?.status === UserStatus.TERMINATED) throw new UserTerminatedError();

  // Super-admins and users with no organization bypass org/subscription checks.
  if (!org) return next();

  if (org.status === OrganizationStatus.SUSPENDED) throw new OrganizationSuspendedError();
  if (org.status === OrganizationStatus.INACTIVE) throw new OrganizationInactiveError();

  if (org.subscription_status === SubscriptionStatus.EXPIRED) throw new SubscriptionExpiredError();

  if (
    org.subscription_status === SubscriptionStatus.CANCELED &&
    (!org.current_period_end || org.current_period_end < new Date())
  ) {
    throw new SubscriptionExpiredError();
  }

  next();
}
