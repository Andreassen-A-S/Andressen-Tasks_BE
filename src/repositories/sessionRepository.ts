import { prisma } from "../db/prisma";
import { SessionPlatform, UserStatus } from "../generated/prisma/client";
import { signUserProfilePicture } from "./userRepository";

const SESSION_DAYS = 30;

function sessionExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d;
}

// Create a new session for login (browser or mobile).
export async function createSession(
  platform: SessionPlatform,
  deviceName?: string,
  location?: string,
): Promise<string> {
  const session = await prisma.session.create({
    data: {
      platform,
      device_name: deviceName ?? null,
      location: location ?? null,
      expires_at: sessionExpiresAt(),
    },
  });
  return session.session_id;
}

// Find an existing non-expired, non-revoked session.
export async function findActiveSession(sessionId: string) {
  return prisma.session.findUnique({
    where: { session_id: sessionId, revoked_at: null, expires_at: { gt: new Date() } },
  });
}

// Create or reactivate a session account for a user within a session.
export async function upsertSessionAccount(
  sessionId: string,
  userId: string,
): Promise<string> {
  const account = await prisma.sessionAccount.upsert({
    where: { session_id_user_id: { session_id: sessionId, user_id: userId } },
    update: { revoked_at: null, last_used_at: new Date() },
    create: { session_id: sessionId, user_id: userId },
  });
  return account.session_account_id;
}

// Set the active account on a session and extend its expiry.
export async function setActiveSessionAccount(
  sessionId: string,
  sessionAccountId: string,
): Promise<void> {
  await prisma.session.update({
    where: { session_id: sessionId },
    data: { active_session_account_id: sessionAccountId, expires_at: sessionExpiresAt() },
  });
}

// Fetch the active user for a session (used for web access-token refresh).
export async function getActiveAccountForSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { session_id: sessionId, revoked_at: null, expires_at: { gt: new Date() } },
    include: {
      active_account: {
        include: {
          user: {
            select: {
              user_id: true, role: true, email: true, name: true,
              organization_id: true, status: true,
            },
          },
        },
      },
    },
  });

  if (!session?.active_account) return null;
  const { active_account: account } = session;
  if (account.revoked_at) return null;
  if (account.user.status !== UserStatus.ACTIVE) return null;
  return { session, account, user: account.user };
}

// Update last_used_at on the account and extend session expiry.
export async function touchSession(
  sessionId: string,
  sessionAccountId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.session.update({
      where: { session_id: sessionId },
      data: { expires_at: sessionExpiresAt() },
    }),
    prisma.sessionAccount.update({
      where: { session_account_id: sessionAccountId },
      data: { last_used_at: new Date() },
    }),
  ]);
}

// Get all non-revoked accounts in a session (for the saved-accounts picker).
export async function getSessionAccounts(sessionId: string) {
  const accounts = await prisma.sessionAccount.findMany({
    where: { session_id: sessionId, revoked_at: null },
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
  return accounts.map((a) => signUserProfilePicture(a.user));
}

// Switch the active account within a session.
export async function switchActiveAccount(sessionId: string, userId: string) {
  const session = await prisma.session.findUnique({
    where: { session_id: sessionId, revoked_at: null, expires_at: { gt: new Date() } },
  });
  if (!session) return null;

  const account = await prisma.sessionAccount.findUnique({
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

  if (!account || account.revoked_at) return null;
  if (account.user.status !== UserStatus.ACTIVE) return null;

  await prisma.$transaction([
    prisma.session.update({
      where: { session_id: sessionId },
      data: { active_session_account_id: account.session_account_id, expires_at: sessionExpiresAt() },
    }),
    prisma.sessionAccount.update({
      where: { session_account_id: account.session_account_id },
      data: { last_used_at: new Date() },
    }),
  ]);

  return { user: account.user };
}

// Get all active sessions for a user for the settings UI.
export async function getActiveSessionsForUser(userId: string) {
  const accounts = await prisma.sessionAccount.findMany({
    where: {
      user_id: userId,
      revoked_at: null,
      session: { revoked_at: null, expires_at: { gt: new Date() } },
    },
    include: { session: true },
    orderBy: { last_used_at: "desc" },
  });

  return accounts.map((a) => ({
    session_id: a.session.session_id,
    session_account_id: a.session_account_id,
    platform: a.session.platform,
    device_name: a.session.device_name,
    location: a.session.location,
    created_at: a.session.created_at,
    last_used_at: a.last_used_at,
    expires_at: a.session.expires_at,
  }));
}

// Revoke a user's account within a session. Returns the session_account_id if found.
export async function revokeSessionAccount(
  sessionId: string,
  userId: string,
): Promise<string | null> {
  const account = await prisma.sessionAccount.findUnique({
    where: { session_id_user_id: { session_id: sessionId, user_id: userId }, revoked_at: null },
    select: { session_account_id: true },
  });
  if (!account) return null;

  await prisma.sessionAccount.update({
    where: { session_account_id: account.session_account_id },
    data: { revoked_at: new Date() },
  });
  return account.session_account_id;
}

// Revoke the active account on a session and clear the active pointer (logout).
export async function revokeActiveAccount(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { session_id: sessionId },
    select: { active_session_account_id: true },
  });
  if (!session?.active_session_account_id) return;

  await prisma.$transaction([
    prisma.session.update({
      where: { session_id: sessionId },
      data: { active_session_account_id: null },
    }),
    prisma.sessionAccount.update({
      where: { session_account_id: session.active_session_account_id },
      data: { revoked_at: new Date() },
    }),
  ]);
}

// Revoke a session account and mark the session revoked if no active accounts remain.
export async function revokeSessionAccountAndMaybeSession(sessionAccountId: string): Promise<void> {
  const account = await prisma.sessionAccount.findUnique({
    where: { session_account_id: sessionAccountId },
    select: { session_id: true, revoked_at: true },
  });
  if (!account || account.revoked_at) return;

  await prisma.sessionAccount.update({
    where: { session_account_id: sessionAccountId },
    data: { revoked_at: new Date() },
  });

  const activeCount = await prisma.sessionAccount.count({
    where: { session_id: account.session_id, revoked_at: null },
  });
  if (activeCount === 0) {
    await prisma.session.update({
      where: { session_id: account.session_id },
      data: { revoked_at: new Date() },
    });
  }
}

// Revoke all session accounts for a user across every session.
export async function revokeAllSessionAccountsForUser(userId: string): Promise<void> {
  await prisma.sessionAccount.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}
