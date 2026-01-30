import { prisma } from "../db/prisma";
import type { User } from "../generated/prisma/client";
import type { CreateUserInput, UpdateUserInput } from "../types/user.ts";

export async function getAllUsers(): Promise<User[]> {
  return prisma.user.findMany({
    orderBy: { created_at: "desc" },
  });
}

export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { user_id: id },
  });
}

export async function createUser(data: CreateUserInput) {
  return prisma.user.create({
    data,
  });
}

export async function updateUser(
  id: string,
  data: UpdateUserInput,
): Promise<User> {
  return prisma.user.update({
    where: { user_id: id },
    data,
  });
}

export async function deleteUser(id: string): Promise<void> {
  await prisma.user.delete({
    where: { user_id: id },
  });
}
