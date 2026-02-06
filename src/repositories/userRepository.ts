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
