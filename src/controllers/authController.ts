import type { Request, Response } from "express";
import * as authService from "../services/authService";
import { parseLocation } from "../utils/uaUtils";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
  maxAge: 30 * 86400 * 1000,
};

export async function login(req: Request, res: Response) {
  const isWebClient = req.headers["x-client"] === "browser";

  try {
    if (isWebClient) {
      const sessionId = (req.cookies as Record<string, string>)?.session_id;
      const result = await authService.authenticateWebUser(req.body, sessionId, req.headers["user-agent"], req.ip);
      res.cookie("session_id", result.sessionId, SESSION_COOKIE_OPTIONS);
      return res.json({ success: true, data: { token: result.token, user: result.user, savedAccounts: result.savedAccounts } });
    }

    // Mobile flow
    const deviceName = typeof req.body.device_name === "string" ? req.body.device_name.trim() || undefined : undefined;
    const location = parseLocation(req.ip);
    const authResult = await authService.authenticateUser(req.body, deviceName, location);
    return res.json({ success: true, data: authResult });
  } catch (error) {
    console.error("Login error:", {
      error: String(error),
      email: req.body?.email,
      timestamp: new Date().toISOString(),
      ip: req.ip,
    });
    throw error;
  }
}

export async function refresh(req: Request, res: Response) {
  const sessionId = (req.cookies as Record<string, string>)?.session_id;

  if (sessionId) {
    // Web session flow
    const result = await authService.refreshWebSession(sessionId);
    res.cookie("session_id", sessionId, SESSION_COOKIE_OPTIONS); // extend cookie expiry
    return res.json({ success: true, data: result });
  }

  // Mobile: body-based refresh token
  const raw = req.body?.refresh_token;
  if (typeof raw !== "string" || !raw) {
    return res.status(400).json({ success: false, error: "Missing refresh token" });
  }

  const result = await authService.refreshTokens(raw);
  return res.json({ success: true, data: result });
}

export async function switchAccount(req: Request, res: Response) {
  const sessionId = (req.cookies as Record<string, string>)?.session_id;
  if (!sessionId) return res.status(401).json({ success: false, error: "No active session" });

  const { user_id } = req.body;
  if (typeof user_id !== "string" || !user_id) {
    return res.status(400).json({ success: false, error: "Missing user_id" });
  }

  const result = await authService.switchAccount(sessionId, user_id);
  return res.json({ success: true, data: result });
}

export async function getSessions(req: Request, res: Response) {
  const userId = (req as any).user?.user_id;
  if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
  const sessionId = (req.cookies as Record<string, string>)?.session_id;
  const sessions = await authService.getActiveSessions(userId, sessionId);
  return res.json({ success: true, data: sessions });
}

export async function revokeAllSessions(req: Request, res: Response) {
  const userId = (req as any).user?.user_id;
  if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
  await authService.revokeAllSessions(userId);
  res.clearCookie("session_id", { path: "/api/auth" });
  return res.json({ success: true });
}

export async function revokeSession(req: Request, res: Response) {
  const userId = (req as any).user?.user_id;
  if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
  const id = typeof req.params.id === "string" ? req.params.id : undefined;
  if (!id) return res.status(400).json({ success: false, error: "Missing session id" });
  const currentSessionId = (req.cookies as Record<string, string>)?.session_id;
  await authService.revokeSession(userId, id, currentSessionId);
  return res.json({ success: true });
}

export async function logout(req: Request, res: Response) {
  const sessionId = (req.cookies as Record<string, string>)?.session_id;
  if (sessionId) {
    await authService.logoutWebSession(sessionId);
    res.clearCookie("session_id", { path: "/api/auth" });
  }

  // Mobile: best-effort server-side revocation
  const raw = req.body?.refresh_token;
  if (typeof raw === "string" && raw) await authService.logout(raw);

  return res.json({ success: true });
}
