import jwt from "jsonwebtoken";
import * as authRepo from "../repositories/authRepository";
import * as refreshTokenRepo from "../repositories/refreshTokenRepository";
import * as browserSessionRepo from "../repositories/browserSessionRepository";
import { AuthenticationError, ForbiddenUserOperationError, UserNotFoundError, UserTerminatedError } from "../errors/domainErrors";
import type { LoginRequest, JWTPayload } from "../types/auth";
import { comparePassword } from "../helper/helpers";
import { UserStatus } from "../generated/prisma/client";
import { generateAccessToken } from "../utils/tokenUtils";
import { parseBrowserDeviceName, parseLocation } from "../utils/uaUtils";

const JWT_SECRET = process.env.JWT_SECRET;

// Dummy bcrypt hash for timing attack mitigation when user is not found.
// This is a valid bcrypt hash (e.g., of the string "password").
const DUMMY_PASSWORD_HASH =
  "$2a$10$CwTycUXWue0Thq9StjUM0uJ8eG8G8YpAo0P5PLf4KJIp4jOSAm5e.";

async function validateCredentials(credentials: LoginRequest) {
  const { email, password } = credentials;

  const user = await authRepo.getUserByEmail(email);

  // Always perform a password verification to reduce timing differences
  const passwordHashToCheck = user ? user.password : DUMMY_PASSWORD_HASH;
  const isPasswordValid = await comparePassword(password, passwordHashToCheck);

  // Use a single generic failure path for both missing user and invalid password
  if (!user || !isPasswordValid) throw new AuthenticationError("Invalid credentials");
  if (user.status === UserStatus.TERMINATED) throw new UserTerminatedError();

  return user;
}

// Web login: creates/updates a browser session, returns savedAccounts summaries.
export async function authenticateWebUser(
  credentials: LoginRequest,
  sessionId: string | undefined,
  userAgent: string | undefined,
  ip: string | undefined,
) {
  const user = await validateCredentials(credentials);
  const token = generateAccessToken(user);
  const deviceName = parseBrowserDeviceName(userAgent);
  const location = parseLocation(ip);
  const sid = await browserSessionRepo.upsertSessionAccount(sessionId, user.user_id, deviceName, location);
  const safeUser = await authRepo.getUserById(user.user_id);
  const savedAccounts = await browserSessionRepo.getSessionAccounts(sid);
  return { token, user: safeUser, sessionId: sid, savedAccounts };
}

// Mobile login: creates a body-based refresh token.
export async function authenticateUser(credentials: LoginRequest, deviceName?: string, location?: string) {
  const user = await validateCredentials(credentials);
  const token = generateAccessToken(user);
  const refresh_token = await refreshTokenRepo.createRefreshToken(user.user_id, deviceName, location);
  const safeUser = await authRepo.getUserById(user.user_id);
  return { token, refresh_token, user: safeUser };
}

// Web refresh: rotates the active account token within the browser session.
export async function refreshWebSession(sessionId: string) {
  const result = await browserSessionRepo.rotateActiveAccount(sessionId);
  if (!result) throw new AuthenticationError("Session expired or invalid");
  const token = generateAccessToken(result.user);
  const safeUser = await authRepo.getUserById(result.user.user_id);
  const savedAccounts = await browserSessionRepo.getSessionAccounts(sessionId);
  return { token, user: safeUser, savedAccounts };
}

// Web switch-account: rotates the target account's token and makes it active.
export async function switchAccount(sessionId: string, userId: string) {
  const result = await browserSessionRepo.switchSessionAccount(sessionId, userId);
  if (!result) throw new AuthenticationError("Account not found in this session");
  const token = generateAccessToken(result.user);
  const safeUser = await authRepo.getUserById(result.user.user_id);
  const savedAccounts = await browserSessionRepo.getSessionAccounts(sessionId);
  return { token, user: safeUser, savedAccounts };
}

// Web logout: revokes the active account from the browser session.
export async function logoutWebSession(sessionId: string): Promise<void> {
  await browserSessionRepo.revokeActiveAccount(sessionId);
}

// Mobile refresh: rotates a body-based refresh token.
export async function refreshTokens(raw: string) {
  const result = await refreshTokenRepo.rotateRefreshToken(raw);
  if (!result) throw new AuthenticationError("Invalid or expired refresh token");
  const token = generateAccessToken(result.user);
  const safeUser = await authRepo.getUserById(result.user.user_id);
  return { token, refresh_token: result.newRaw, user: safeUser };
}

// Returns all active sessions (browser + mobile) for the authenticated user.
export async function getActiveSessions(userId: string, currentSessionId: string | undefined) {
  const [browserSessions, mobileTokens] = await Promise.all([
    browserSessionRepo.getActiveSessionsForUser(userId),
    refreshTokenRepo.getActiveTokensForUser(userId),
  ]);

  const browser = browserSessions.map((s) => ({
    id: s.session_id,
    type: "browser" as const,
    current: s.session_id === currentSessionId,
    created_at: s.created_at,
    last_used_at: s.last_used_at,
    expires_at: s.expires_at,
    label: s.device_name ?? "Browser",
    location: s.location,
  }));

  const mobile = mobileTokens.map((t) => ({
    id: t.token_id,
    type: "mobile" as const,
    current: false,
    created_at: t.created_at,
    last_used_at: t.created_at,
    expires_at: t.expires_at,
    label: t.device_name ?? "Mobilapp",
    location: t.location,
  }));

  return [...browser, ...mobile].sort(
    (a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime(),
  );
}

// Revoke all sessions for a user across all browsers and mobile devices.
export async function revokeAllSessions(userId: string): Promise<void> {
  await Promise.all([
    browserSessionRepo.revokeAllSessionsForUser(userId),
    refreshTokenRepo.revokeAllTokensForUser(userId),
  ]);
}

// Revoke a browser session account binding. Cannot revoke the current session (use logout instead).
export async function revokeWebSession(userId: string, sessionId: string, currentSessionId: string | undefined): Promise<void> {
  if (sessionId === currentSessionId) {
    throw new ForbiddenUserOperationError("Use logout to end your current session");
  }
  const revoked = await browserSessionRepo.revokeSessionForUser(sessionId, userId);
  if (!revoked) throw new UserNotFoundError(sessionId);
}

// Revoke a mobile refresh token by id, scoped to the requesting user.
export async function revokeMobileSession(userId: string, tokenId: string): Promise<void> {
  const revoked = await refreshTokenRepo.revokeTokenById(tokenId, userId);
  if (!revoked) throw new UserNotFoundError(tokenId);
}

// Mobile logout: revokes a body-based refresh token.
export async function logout(raw: string): Promise<void> {
  await refreshTokenRepo.revokeRefreshToken(raw);
}

// Used by authenticateToken middleware to verify access tokens on every request.
export function verifyToken(token: string): JWTPayload {
  if (!JWT_SECRET) {
    console.error("JWT configuration error: JWT_SECRET not set");
    throw new Error("JWT_SECRET is not configured");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof Error) {
      console.error("JWT verification error:", {
        name: error.name,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
    throw new AuthenticationError("Invalid token");
  }
}
