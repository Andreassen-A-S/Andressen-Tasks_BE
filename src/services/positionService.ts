import * as positionRepo from "../repositories/positionRepository";
import type { RequestContext } from "../types/requestContext";
import { UserRole } from "../generated/prisma/client";
import { ForbiddenUserOperationError, MissingOrganizationError } from "../errors/domainErrors";

export { DuplicatePositionError, PositionNotFoundError } from "../errors/domainErrors";

function requireAdminRole(ctx: RequestContext) {
  if (ctx.actorRole !== UserRole.ADMIN && ctx.actorRole !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenUserOperationError();
  }
}

export async function listPositions(ctx: RequestContext) {
  return positionRepo.getAllPositions(ctx.effectiveOrgId);
}

export async function createPosition(ctx: RequestContext, name: string) {
  requireAdminRole(ctx);
  if (!ctx.effectiveOrgId) throw new MissingOrganizationError();
  return positionRepo.createPosition(ctx.effectiveOrgId, name);
}

export async function updatePosition(ctx: RequestContext, positionId: string, name: string) {
  requireAdminRole(ctx);
  if (!ctx.effectiveOrgId) throw new MissingOrganizationError();
  return positionRepo.updatePositionInOrg(positionId, ctx.effectiveOrgId, name);
}

export async function deletePosition(ctx: RequestContext, positionId: string) {
  requireAdminRole(ctx);
  if (!ctx.effectiveOrgId) throw new MissingOrganizationError();
  return positionRepo.deletePositionInOrg(positionId, ctx.effectiveOrgId);
}
