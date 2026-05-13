import { prisma } from "../db/prisma";
import { Prisma, UserRole } from "../generated/prisma/client";
import type { User } from "../generated/prisma/client";
import { hashPassword } from "../helper/helpers";
import {
  userSelect,
  type CreateUserInput,
  type SafeUser,
  type UpdateUserInput,
} from "../types/user";
import { UserNotFoundError } from "../errors/domainErrors";

export async function getAllUsers(orgId: string | null): Promise<SafeUser[]> {
  return prisma.user.findMany({
    where: {
      role: { not: UserRole.SYSTEM },
      ...(orgId ? { organization_id: orgId } : {}),
    },
    select: userSelect,
    orderBy: { created_at: "desc" },
  });
}

export async function getUserById(id: string, orgId: string | null): Promise<SafeUser | null> {
  return prisma.user.findFirst({
    where: {
      user_id: id,
      role: { not: UserRole.SYSTEM },
      ...(orgId ? { organization_id: orgId } : {}),
    },
    select: userSelect,
  });
}

// Creates a new user in the organization. Password is hashed before persisting.
// organization_id is always set by the service layer, never trusted from client input.
export async function createUser(data: CreateUserInput) {
  const hashedPassword = await hashPassword(data.password);

  return prisma.user.create({
    data: {
      ...data,
      password: hashedPassword,
    },
    select: userSelect,
  });
}

async function updateUserScoped(
  id: string,
  data: UpdateUserInput,
  orgId?: string,
): Promise<SafeUser> {
  const existing = await prisma.user.findFirst({
    where: {
      user_id: id,
      ...(orgId ? { organization_id: orgId } : {}),
    },
    select: { role: true },
  });
  if (!existing || existing.role === UserRole.SYSTEM) {
    throw new UserNotFoundError(id);
  }
  if (data.password) {
    data.password = await hashPassword(data.password);
  }
  return prisma.user.update({
    where: { user_id: id },
    data,
    select: userSelect,
  });
}

// Org-scoped user update. Validates that the user belongs to the specified org
// before mutating, preventing cross-org edits.
export async function updateUserInOrg(
  id: string,
  orgId: string,
  data: UpdateUserInput,
): Promise<SafeUser> {
  return updateUserScoped(id, data, orgId);
}

export async function updateUserPlatform(
  id: string,
  data: UpdateUserInput,
): Promise<SafeUser> {
  return updateUserScoped(id, data);
}

async function deleteUserScoped(
  id: string,
  orgId?: string,
): Promise<void> {
  const result = await prisma.user.deleteMany({
    where: {
      user_id: id,
      role: { not: UserRole.SYSTEM },
      ...(orgId ? { organization_id: orgId } : {}),
    },
  });
  if (result.count === 0) {
    throw new UserNotFoundError(id);
  }
}

// Org-scoped user delete. Scopes by org to prevent cross-org deletions.
export async function deleteUserInOrg(id: string, orgId: string): Promise<void> {
  return deleteUserScoped(id, orgId);
}

export async function deleteUserPlatform(id: string): Promise<void> {
  return deleteUserScoped(id);
}

export async function updatePushToken(
  userId: string,
  pushToken: string | null,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      if (pushToken) {
        await tx.user.updateMany({
          where: { push_token: pushToken, user_id: { not: userId } },
          data: { push_token: null },
        });
      }
      await tx.user.update({
        where: { user_id: userId },
        data: { push_token: pushToken },
      });
    });
  } catch (err) {
    // A concurrent registration claimed the same token between our updateMany
    // and update. Clear the conflict and retry once — the unique constraint
    // guarantees only one row can hold the token after this.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      await prisma.user.updateMany({
        where: { push_token: pushToken },
        data: { push_token: null },
      });
      await prisma.user.update({
        where: { user_id: userId },
        data: { push_token: pushToken },
      });
      return;
    }
    throw err;
  }
}

export async function getPushToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { user_id: userId },
    select: { push_token: true },
  });
  return user?.push_token ?? null;
}

export async function getPushTokensForUsers(
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { user_id: { in: userIds }, push_token: { not: null } },
    select: { user_id: true, push_token: true },
  });
  return new Map(users.map((u) => [u.user_id, u.push_token!]));
}

export async function getAdminPushTokens(orgId: string | null = null): Promise<
  { user_id: string; push_token: string }[]
> {
  const admins = await prisma.user.findMany({
    where: {
      role: UserRole.ADMIN,
      push_token: { not: null },
      ...(orgId ? { organization_id: orgId } : {}),
    },
    select: { user_id: true, push_token: true },
  });
  return admins.map((a) => ({ user_id: a.user_id, push_token: a.push_token! }));
}
