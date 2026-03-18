import { prisma } from "../db/prisma";
import type { User } from "../generated/prisma/client";
import { hashPassword } from "../helper/helpers";
import {
  userSelect,
  type CreateUserInput,
  type SafeUser,
  type UpdateUserInput,
} from "../types/user";

export async function getAllUsers(): Promise<SafeUser[]> {
  return prisma.user.findMany({
    select: userSelect,
    orderBy: { created_at: "desc" },
  });
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  return prisma.user.findUnique({
    where: { user_id: id },
    select: userSelect,
  });
}

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

export async function updateUser(
  id: string,
  data: UpdateUserInput,
): Promise<SafeUser> {
  if (data.password) {
    data.password = await hashPassword(data.password);
  }
  return prisma.user.update({
    where: { user_id: id },
    data,
    select: userSelect,
  });
}

export async function deleteUser(id: string): Promise<void> {
  await prisma.user.delete({
    where: { user_id: id },
  });
}

export async function updatePushToken(
  userId: string,
  pushToken: string | null,
): Promise<void> {
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

export async function getAdminPushTokens(): Promise<
  { user_id: string; push_token: string }[]
> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", push_token: { not: null } },
    select: { user_id: true, push_token: true },
  });
  return admins.map((a) => ({ user_id: a.user_id, push_token: a.push_token! }));
}
