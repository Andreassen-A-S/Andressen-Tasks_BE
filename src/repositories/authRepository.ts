import { prisma } from "../db/prisma";
import type { User } from "../generated/prisma/client";
import type { SafeUser } from "../types/user";

export async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { email },
  });
}

export async function getUserById(userId: string): Promise<SafeUser | null> {
  return prisma.user.findUnique({
    where: { user_id: userId },
    select: {
      user_id: true,
      name: true,
      email: true,
      role: true,
      position: true,
      created_at: true,
      updated_at: true,
      password: false,
    },
  });
}
