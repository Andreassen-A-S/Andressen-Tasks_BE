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
      name: string;
      email: string;
      role: string;
      position: string;
    };
  };
  error?: string;
}

export interface JWTPayload {
  userId: string;
  role: string;
  email: string;
}
