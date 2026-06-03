import type { SafeUser } from "./user";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data?: {
    token: string;
    // Web: savedAccounts summaries; absent on mobile responses
    savedAccounts?: Pick<SafeUser, "user_id" | "name" | "email" | "role" | "organization_id" | "profile_picture_url" | "status">[];
    // Mobile: body-based refresh token; absent on web responses
    refresh_token?: string;
    user: SafeUser | null;
  };
  error?: string;
}

export interface JWTPayload {
  user_id: string;
  role: string;
  email: string;
  name: string | null;
  organization_id: string;
}
