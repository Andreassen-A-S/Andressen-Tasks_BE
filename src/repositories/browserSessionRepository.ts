import { prisma } from "../db/prisma";
import { generateRawRefreshToken, hashToken } from "../utils/tokenUtils";
import { UserStatus } from "../generated/prisma/client";

const SESSION_DAYS = 30;
const ACCOUNT_DAYS = 30;

function expiresAt(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// Upsert an account into a browser session (login / add-account).
// Creates a new session if sessionId is absent or expired.
// Returns the session_id (new or existing).
export async function upsertSessionAccount(
  sessionId: string | undefined,
  userId: string,
  deviceName?: string,
  location?: string,
): Promise<string> {
  let sid = sessionId;

  if (sid) {
    const existing = await prisma.browserSession.findUnique({ where: { session_id: sid } });
    if (!existing || existing.expires_at < new Date()) sid = undefined;
  }

  if (!sid) {
    const session = await prisma.browserSession.create({
      data: { active_user_id: userId, expires_at: expiresAt(SESSION_DAYS), device_name: deviceName ?? null, location: location ?? null },
    });
    sid = session.session_id;
  } else {
    await prisma.browserSession.update({
      where: { session_id: sid },
      data: {
        active_user_id: userId,
        expires_at: expiresAt(SESSION_DAYS),
        ...(deviceName ? { device_name: deviceName } : {}),
        ...(location ? { location } : {}),
      },
    });
  }

  const raw = generateRawRefreshToken();
  await prisma.browserSessionAccount.upsert({
    where: { session_id_user_id: { session_id: sid, user_id: userId } },
    update: {
      refresh_token_hash: hashToken(raw),
      expires_at: expiresAt(ACCOUNT_DAYS),
      revoked_at: null,
      last_used_at: new Date(),
    },
    create: {
      session_id: sid,
      user_id: userId,
      refresh_token_hash: hashToken(raw),
      expires_at: expiresAt(ACCOUNT_DAYS),
    },
  });

  return sid;
}

// Rotate the active account's token and extend the session. Used on web refresh.
export async function rotateActiveAccount(sessionId: string) {
  const session = await prisma.browserSession.findUnique({ where: { session_id: sessionId } });
  if (!session || session.expires_at < new Date() || !session.active_user_id) return null;

  const account = await prisma.browserSessionAccount.findUnique({
    where: { session_id_user_id: { session_id: sessionId, user_id: session.active_user_id } },
    include: {
      user: {
        select: {
          user_id: true, role: true, email: true, name: true,
          organization_id: true, status: true,
        },
      },
    },
  });

  if (!account || account.revoked_at || account.expires_at < new Date()) return null;
  if (account.user.status !== UserStatus.ACTIVE) return null;

  const newRaw = generateRawRefreshToken();
  await prisma.$transaction([
    prisma.browserSessionAccount.update({
      where: { session_id_user_id: { session_id: sessionId, user_id: session.active_user_id } },
      data: {
        refresh_token_hash: hashToken(newRaw),
        last_used_at: new Date(),
        expires_at: expiresAt(ACCOUNT_DAYS),
      },
    }),
    prisma.browserSession.update({
      where: { session_id: sessionId },
      data: { expires_at: expiresAt(SESSION_DAYS) },
    }),
  ]);

  return { user: account.user };
}

// Switch the active account within a session and rotate its token.
export async function switchSessionAccount(sessionId: string, userId: string) {
  const session = await prisma.browserSession.findUnique({ where: { session_id: sessionId } });
  if (!session || session.expires_at < new Date()) return null;

  const account = await prisma.browserSessionAccount.findUnique({
    where: { session_id_user_id: { session_id: sessionId, user_id: userId } },
    include: {
      user: {
        select: {
          user_id: true, role: true, email: true, name: true,
          organization_id: true, status: true,
        },
      },
    },
  });

  if (!account || account.revoked_at || account.expires_at < new Date()) return null;
  if (account.user.status !== UserStatus.ACTIVE) return null;

  const newRaw = generateRawRefreshToken();
  await prisma.$transaction([
    prisma.browserSessionAccount.update({
      where: { session_id_user_id: { session_id: sessionId, user_id: userId } },
      data: {
        refresh_token_hash: hashToken(newRaw),
        last_used_at: new Date(),
        expires_at: expiresAt(ACCOUNT_DAYS),
      },
    }),
    prisma.browserSession.update({
      where: { session_id: sessionId },
      data: { active_user_id: userId, expires_at: expiresAt(SESSION_DAYS) },
    }),
  ]);

  return { user: account.user };
}

// Get all active (non-revoked, non-expired) accounts in a session for the UI.
export async function getSessionAccounts(sessionId: string) {
  const accounts = await prisma.browserSessionAccount.findMany({
    where: { session_id: sessionId, revoked_at: null, expires_at: { gt: new Date() } },
    include: {
      user: {
        select: {
          user_id: true, name: true, email: true, role: true,
          organization_id: true, profile_picture_url: true, status: true,
        },
      },
    },
    orderBy: { last_used_at: "desc" },
  });
  return accounts.map((a) => a.user);
}

// Get all active browser sessions for a user (for settings UI).
export async function getActiveSessionsForUser(userId: string) {
  const accounts = await prisma.browserSessionAccount.findMany({
    where: {
      user_id: userId,
      revoked_at: null,
      expires_at: { gt: new Date() },
      session: { expires_at: { gt: new Date() } },
    },
    select: {
      last_used_at: true,
      expires_at: true,
      session: { select: { session_id: true, created_at: true, device_name: true, location: true } },
    },
    orderBy: { last_used_at: "desc" },
  });
  return accounts.map((a) => ({
    session_id: a.session.session_id,
    device_name: a.session.device_name,
    location: a.session.location,
    created_at: a.session.created_at,
    last_used_at: a.last_used_at,
    expires_at: a.expires_at,
  }));
}

// Revoke all of a user's browser session account bindings across all sessions.
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.browserSessionAccount.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

// Revoke a user's account binding within a browser session (does not affect other accounts in the session).
export async function revokeSessionForUser(sessionId: string, userId: string): Promise<boolean> {
  const result = await prisma.browserSessionAccount.updateMany({
    where: { session_id: sessionId, user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
  return result.count > 0;
}

// Revoke the active account from the session (logout current account).
export async function revokeActiveAccount(sessionId: string): Promise<void> {
  const session = await prisma.browserSession.findUnique({ where: { session_id: sessionId } });
  if (!session?.active_user_id) return;

  await prisma.browserSessionAccount.updateMany({
    where: { session_id: sessionId, user_id: session.active_user_id },
    data: { revoked_at: new Date() },
  });
}
