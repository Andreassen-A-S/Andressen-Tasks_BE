import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { UserRole } from "../generated/prisma/client";

export function generateAccessToken(user: {
  user_id: string;
  role: UserRole;
  email: string;
  name: string | null;
  organization_id: string | null;
}): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return jwt.sign(
    {
      user_id: user.user_id,
      role: user.role,
      email: user.email,
      name: user.name,
      organization_id: user.organization_id,
    },
    secret,
    { expiresIn: "15m" },
  );
}

export function generateRawRefreshToken(): string {
  return crypto.randomBytes(40).toString("hex");
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
