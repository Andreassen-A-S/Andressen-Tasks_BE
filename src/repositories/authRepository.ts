import { prisma } from "../db/prisma";
import { UserRole } from "../generated/prisma/client";
import type { User } from "../generated/prisma/client";
import type { SafeUser } from "../types/user";
import { userSelect } from "../types/user";
import { signUserProfilePicture } from "./userRepository";

export async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: { email, role: { notIn: [UserRole.SYSTEM] } },
  });
}

export async function getUserById(userId: string): Promise<SafeUser | null> {
  const user = await prisma.user.findUnique({
    where: { user_id: userId },
    select: userSelect,
  });
  if (!user) return null;
  return signUserProfilePicture(user);
}
