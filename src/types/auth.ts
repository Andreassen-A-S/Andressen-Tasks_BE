import type { SafeUser } from "./user";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data?: {
    token: string;
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
