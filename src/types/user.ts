import type { UserRole } from "../generated/prisma/client";

export interface SafeUser {
  user_id: string;
  name: string;
  email: string;
  position: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  position?: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  position: string;
}

export const userSelect = {
  user_id: true,
  name: true,
  email: true,
  role: true,
  position: true,
  created_at: true,
  updated_at: true,
};
