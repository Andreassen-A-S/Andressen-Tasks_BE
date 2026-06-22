import type { UserRole, UserStatus } from "../generated/prisma/client";

export interface PositionSummary {
  position_id: string;
  name: string;
}

export interface OrganizationSummary {
  org_id: string;
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
  profile_picture_url: string | null;
  organization_id: string;
  organization: OrganizationSummary;
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
  profile_picture_url?: string | null;
  organization_id?: string;
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
  profile_picture_url: true,
  organization_id: true,
  organization: {
    select: {
      org_id: true,
      name: true,
    },
  },
  created_at: true,
  updated_at: true,
};
