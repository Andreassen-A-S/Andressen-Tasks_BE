import { prisma } from "../db/prisma";
import { UserRole } from "../generated/prisma/client";
import type { User } from "../generated/prisma/client";
import type { SafeUser } from "../types/user";
import { userSelect } from "../types/user";

export async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: { email, role: { notIn: [UserRole.SYSTEM] } },
  });
}

export async function getUserById(userId: string): Promise<SafeUser | null> {
  return prisma.user.findUnique({
    where: { user_id: userId },
    select: userSelect,
  }) as Promise<SafeUser | null>;
}
