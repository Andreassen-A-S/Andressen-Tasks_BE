import type { UserRole } from "../generated/prisma/client";

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
