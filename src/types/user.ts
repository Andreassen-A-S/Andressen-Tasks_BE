import type { UserRole, UserStatus } from "../generated/prisma/client";

export interface PositionSummary {
  position_id: string;
  name: string;
}

export interface SafeUser {
  user_id: string;
  name: string | null;
  email: string;
  position_id: string | null;
  position: PositionSummary | null;
  role: UserRole;
  status: UserStatus;
  organization_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  status?: UserStatus;
  position_id?: string | null;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  position_id?: string;
  organization_id: string;
}

export const userSelect = {
  user_id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  position_id: true,
  position: {
    select: {
      position_id: true,
      name: true,
    },
  },
  organization_id: true,
  created_at: true,
  updated_at: true,
};
