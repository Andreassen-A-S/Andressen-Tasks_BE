import jwt from "jsonwebtoken";
import * as authRepo from "../repositories/authRepository";
import type { LoginRequest, JWTPayload } from "../types/auth";
import { comparePassword } from "../helper/helpers";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

// Dummy bcrypt hash for timing attack mitigation when user is not found.
// This is a valid bcrypt hash (e.g., of the string "password").
const DUMMY_PASSWORD_HASH =
  "$2a$10$CwTycUXWue0Thq9StjUM0uJ8eG8G8YpAo0P5PLf4KJIp4jOSAm5e.";

export async function authenticateUser(credentials: LoginRequest) {
  const { email, password } = credentials;

  // Find user by email
  const user = await authRepo.getUserByEmail(email);

  // Always perform a password verification to reduce timing differences
  const passwordHashToCheck = user ? user.password : DUMMY_PASSWORD_HASH;
  const isPasswordValid = await comparePassword(password, passwordHashToCheck);

  // Use a single generic failure path for both missing user and invalid password
  if (!user || !isPasswordValid) {
    throw new Error("Invalid credentials");
  }

  // Validate JWT configuration - use type assertion to help TypeScript
  const secret = JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  // Generate JWT token with explicit typing
  const payload: JWTPayload = {
    user_id: user.user_id,
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
    console.error("JWT configuration error: JWT_SECRET not set");
    throw new Error("JWT_SECRET is not configured");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    // Log specific JWT errors for debugging
    if (error instanceof Error) {
      console.error("JWT verification error:", {
        name: error.name,
        message: error.message,
        timestamp: new Date().toISOString(),
      });

      // You could differentiate error types for internal logging
      switch (error.name) {
        case "TokenExpiredError":
          console.warn("Token expired:", error.message);
          break;
        case "JsonWebTokenError":
          console.warn("Invalid JWT format:", error.message);
          break;
        case "NotBeforeError":
          console.warn("Token not active yet:", error.message);
          break;
        default:
          console.error("Unknown JWT error:", error);
      }
    }

    // Always throw generic error to client
    throw new Error("Invalid or expired token");
  }
}
