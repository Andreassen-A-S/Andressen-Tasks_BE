import { UserRole } from "../generated/prisma/client";
import type { Request } from "express";

export interface RequestContext {
  actorUserId: string;
  actorRole: UserRole;
  actorOrgId: string | null;
  effectiveOrgId: string | null;
  isSuperAdmin: boolean;
}

export function getRequestContext(req: Request): RequestContext | null {
  if (!req.user) return null;

  return {
    actorUserId: req.user.user_id,
    actorRole: req.user.role,
    actorOrgId: req.user.organization_id,
    effectiveOrgId: req.effectiveOrgId,
    isSuperAdmin: req.user.role === UserRole.SUPER_ADMIN,
  };
}
