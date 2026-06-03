import jwt from "jsonwebtoken";
import * as authRepo from "../repositories/authRepository";
import * as refreshTokenRepo from "../repositories/refreshTokenRepository";
import * as sessionRepo from "../repositories/sessionRepository";
import { AuthenticationError, ForbiddenUserOperationError, UserNotFoundError, UserTerminatedError } from "../errors/domainErrors";
import type { LoginRequest, JWTPayload } from "../types/auth";
import { comparePassword } from "../helper/helpers";
import { SessionPlatform, UserStatus } from "../generated/prisma/client";
import { generateAccessToken } from "../utils/tokenUtils";
import { parseBrowserDeviceName, parseLocation } from "../utils/uaUtils";

const JWT_SECRET = process.env.JWT_SECRET;

// Dummy bcrypt hash for timing attack mitigation when user is not found.
const DUMMY_PASSWORD_HASH =
  "$2a$10$CwTycUXWue0Thq9StjUM0uJ8eG8G8YpAo0P5PLf4KJIp4jOSAm5e.";

async function validateCredentials(credentials: LoginRequest) {
  const { email, password } = credentials;
  const user = await authRepo.getUserByEmail(email);
  const passwordHashToCheck = user ? user.password : DUMMY_PASSWORD_HASH;
  const isPasswordValid = await comparePassword(password, passwordHashToCheck);
  if (!user || !isPasswordValid) throw new AuthenticationError("Invalid credentials");
  if (user.status === UserStatus.TERMINATED) throw new UserTerminatedError();
  return user;
}

// Web login: finds or creates a browser session, returns savedAccounts summaries.
export async function authenticateWebUser(
  credentials: LoginRequest,
  sessionId: string | undefined,
  userAgent: string | undefined,
  ip: string | undefined,
) {
  const user = await validateCredentials(credentials);

  let sid = sessionId;
  if (sid) {
    const existing = await sessionRepo.findActiveSession(sid);
    if (!existing || existing.platform !== SessionPlatform.browser) sid = undefined;
  }

  if (!sid) {
    sid = await sessionRepo.createSession(
      SessionPlatform.browser,
      parseBrowserDeviceName(userAgent),
      parseLocation(ip),
    );
  }

  const sessionAccountId = await sessionRepo.upsertSessionAccount(sid, user.user_id);
  await sessionRepo.setActiveSessionAccount(sid, sessionAccountId);

  const token = generateAccessToken(user);
  const safeUser = await authRepo.getUserById(user.user_id);
  const savedAccounts = await sessionRepo.getSessionAccounts(sid);

  return { token, user: safeUser, sessionId: sid, savedAccounts };
}

// Mobile login: creates a session + session account + refresh token.
export async function authenticateUser(
  credentials: LoginRequest,
  deviceName?: string,
  location?: string,
) {
  const user = await validateCredentials(credentials);

  const sid = await sessionRepo.createSession(SessionPlatform.mobile, deviceName, location);
  const sessionAccountId = await sessionRepo.upsertSessionAccount(sid, user.user_id);
  await sessionRepo.setActiveSessionAccount(sid, sessionAccountId);
  const refreshToken = await refreshTokenRepo.createRefreshToken(sessionAccountId);

  const token = generateAccessToken(user);
  const safeUser = await authRepo.getUserById(user.user_id);

  return { token, refresh_token: refreshToken, user: safeUser };
}

// Web refresh: validates session cookie and returns a new access token.
export async function refreshWebSession(sessionId: string) {
  const result = await sessionRepo.getActiveAccountForSession(sessionId);
  if (!result) throw new AuthenticationError("Session expired or invalid");

  await sessionRepo.touchSession(sessionId, result.account.session_account_id);

  const token = generateAccessToken(result.user);
  const safeUser = await authRepo.getUserById(result.user.user_id);
  const savedAccounts = await sessionRepo.getSessionAccounts(sessionId);

  return { token, user: safeUser, savedAccounts };
}

// Web account switch: changes the active account within a session.
export async function switchAccount(sessionId: string, userId: string) {
  const result = await sessionRepo.switchActiveAccount(sessionId, userId);
  if (!result) throw new AuthenticationError("Account not found in this session");

  const token = generateAccessToken(result.user);
  const safeUser = await authRepo.getUserById(result.user.user_id);
  const savedAccounts = await sessionRepo.getSessionAccounts(sessionId);

  return { token, user: safeUser, savedAccounts };
}

// Web logout: revokes the active account from the browser session.
export async function logoutWebSession(sessionId: string): Promise<void> {
  await sessionRepo.revokeActiveAccount(sessionId);
}

// Mobile refresh: rotates a body-based refresh token.
export async function refreshTokens(raw: string) {
  const result = await refreshTokenRepo.rotateRefreshToken(raw);
  if (!result) throw new AuthenticationError("Invalid or expired refresh token");

  const token = generateAccessToken(result.user);
  const safeUser = await authRepo.getUserById(result.user.user_id);

  return { token, refresh_token: result.newRaw, user: safeUser };
}

// Mobile logout: best-effort revocation of a refresh token.
export async function logout(raw: string): Promise<void> {
  await refreshTokenRepo.revokeRefreshToken(raw);
}

// Returns all active sessions for the authenticated user.
export async function getActiveSessions(userId: string, currentSessionId: string | undefined) {
  const sessions = await sessionRepo.getActiveSessionsForUser(userId);

  return sessions.map((s) => ({
    id: s.session_id,
    type: s.platform === SessionPlatform.browser ? "browser" as const : "mobile" as const,
    current: s.session_id === currentSessionId,
    created_at: s.created_at,
    last_used_at: s.last_used_at,
    expires_at: s.expires_at,
    label: s.device_name ?? (s.platform === SessionPlatform.browser ? "Browser" : "Mobilapp"),
    location: s.location,
  }));
}

// Revoke a session for the current user. Cannot revoke the current web session.
export async function revokeSession(
  userId: string,
  sessionId: string,
  currentSessionId: string | undefined,
): Promise<void> {
  if (sessionId === currentSessionId) {
    throw new ForbiddenUserOperationError("Use logout to end your current session");
  }
  const sessionAccountId = await sessionRepo.revokeSessionAccount(sessionId, userId);
  if (!sessionAccountId) throw new UserNotFoundError(sessionId);
  await refreshTokenRepo.revokeTokensBySessionAccount(sessionAccountId);
}

// Revoke all sessions for a user across all browsers and mobile devices.
export async function revokeAllSessions(userId: string): Promise<void> {
  await refreshTokenRepo.revokeAllTokensForUser(userId);
  await sessionRepo.revokeAllSessionAccountsForUser(userId);
}

// Used by authenticateToken middleware to verify access tokens.
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
