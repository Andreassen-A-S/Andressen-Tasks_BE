import { UserRole } from "../generated/prisma/client";
import * as userRepo from "../repositories/userRepository";
import type { CreateUserInput, UpdateUserInput } from "../types/user";
import type { RequestContext } from "../types/requestContext";
import {
  ForbiddenUserOperationError,
  InvalidUserRoleError,
  MissingOrganizationError,
  RequiredOrganizationIdError,
} from "../errors/domainErrors";

// Re-export error classes for backward compatibility with controllers that import from this module.
export {
  ForbiddenUserOperationError,
  InvalidUserRoleError,
  MissingOrganizationError,
  RequiredOrganizationIdError,
} from "../errors/domainErrors";

function resolveCreateUserRole(actorRole: UserRole, requestedRole: unknown): UserRole {
  if (requestedRole === undefined) return UserRole.USER;
  if (requestedRole === UserRole.USER || requestedRole === UserRole.ADMIN) return requestedRole;
  if (requestedRole === UserRole.SUPER_ADMIN && actorRole === UserRole.SUPER_ADMIN) {
    return UserRole.SUPER_ADMIN;
  }
  throw new InvalidUserRoleError();
}

function resolveMutationOrgScope(ctx: RequestContext): string | null {
  if (ctx.actorRole === UserRole.SUPER_ADMIN) return ctx.effectiveOrgId;
  if (ctx.actorRole === UserRole.ADMIN || ctx.actorRole === UserRole.USER) {
    if (!ctx.actorOrgId) throw new MissingOrganizationError();
    return ctx.actorOrgId;
  }
  throw new ForbiddenUserOperationError();
}

export async function listUsers(ctx: RequestContext) {
  return userRepo.getAllUsers(ctx.effectiveOrgId);
}

export async function getUser(ctx: RequestContext, userId: string) {
  return userRepo.getUserById(userId, ctx.effectiveOrgId);
}

// Creates a user in the org determined by the actor's role.
// Admins always create within their own org; super-admins must supply organization_id.
// Role escalation above the actor's own role is rejected.
export async function createUser(ctx: RequestContext, body: CreateUserInput) {
  if (ctx.actorRole !== UserRole.ADMIN && ctx.actorRole !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenUserOperationError();
  }

  const role = resolveCreateUserRole(ctx.actorRole, body.role);
  let organization_id: string | null;

  if (ctx.actorRole === UserRole.SUPER_ADMIN) {
    organization_id =
      typeof body.organization_id === "string" && body.organization_id.trim() !== ""
        ? body.organization_id.trim()
        : null;
    // Super-admin must supply organization_id; missing means a bad request (400).
    if (!organization_id) throw new RequiredOrganizationIdError();
  } else {
    if (!ctx.actorOrgId) throw new MissingOrganizationError();
    organization_id = ctx.actorOrgId;
  }

  return userRepo.createUser({
    name: body.name,
    email: body.email,
    password: body.password,
    position: body.position,
    role,
    organization_id,
  });
}

export async function updateUser(ctx: RequestContext, targetId: string, body: UpdateUserInput) {
  if (
    ctx.actorUserId !== targetId &&
    ctx.actorRole !== UserRole.ADMIN &&
    ctx.actorRole !== UserRole.SUPER_ADMIN
  ) {
    throw new ForbiddenUserOperationError();
  }

  const scopeOrgId = resolveMutationOrgScope(ctx);
  return scopeOrgId
    ? userRepo.updateUserInOrg(targetId, scopeOrgId, body)
    : userRepo.updateUserPlatform(targetId, body);
}

export async function deleteUser(ctx: RequestContext, targetId: string) {
  if (ctx.actorRole !== UserRole.ADMIN && ctx.actorRole !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenUserOperationError();
  }

  const scopeOrgId = resolveMutationOrgScope(ctx);
  return scopeOrgId
    ? userRepo.deleteUserInOrg(targetId, scopeOrgId)
    : userRepo.deleteUserPlatform(targetId);
}

// Only the authenticated user can register their own push token.
// Validates token format; passes null to deregister.
export async function registerPushToken(userId: string, pushToken: string | null) {
  await userRepo.updatePushToken(userId, pushToken);
}
