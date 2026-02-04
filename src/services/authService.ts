import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import * as authRepo from "../repositories/authRepository";
import type { LoginRequest, JWTPayload } from "../types/auth";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export async function authenticateUser(credentials: LoginRequest) {
  const { email, password } = credentials;

  // Find user by email
  const user = await authRepo.getUserByEmail(email);
  if (!user) {
    throw new Error("Invalid credentials");
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new Error("Invalid credentials");
  }

  // Validate JWT configuration - use type assertion to help TypeScript
  const secret = JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  // Generate JWT token with explicit typing
  const payload: JWTPayload = {
    userId: user.user_id,
    role: user.role,
    email: user.email,
    name: user.name,
  };

  const token = jwt.sign(payload, secret, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);

  // Return user data (without password) and token
  return {
    token,
    user: {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      position: user.position,
    },
  };
}

export function verifyToken(token: string): JWTPayload {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}
