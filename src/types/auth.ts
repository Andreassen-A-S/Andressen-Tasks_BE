export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data?: {
    token: string;
    user: {
      user_id: string;
      name: string | null;
      email: string;
      role: string;
      position_id: string | null;
      organization_id: string;
    };
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
