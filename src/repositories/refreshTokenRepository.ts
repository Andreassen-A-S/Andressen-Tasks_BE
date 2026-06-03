import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";
import { generateRawRefreshToken, hashToken } from "../utils/tokenUtils";
import { UserStatus } from "../generated/prisma/client";

function expiresAt(days = 30): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// Create the first token in a new family for a session account.
export async function createRefreshToken(sessionAccountId: string): Promise<string> {
  const raw = generateRawRefreshToken();
  await prisma.refreshToken.create({
    data: {
      session_account_id: sessionAccountId,
      token_hash: hashToken(raw),
      family_id: randomUUID(),
      expires_at: expiresAt(),
    },
  });
  return raw;
}

// Rotate a token: mark old as used, create replacement in the same family.
// Detects replay attacks: if the token was already used, revokes the entire family.
export async function rotateRefreshToken(raw: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token_hash: hashToken(raw) },
    include: {
      session_account: {
        include: {
          user: {
            select: {
              user_id: true, role: true, email: true, name: true,
              organization_id: true, status: true,
            },
          },
          session: { select: { revoked_at: true, expires_at: true } },
        },
      },
    },
  });

  if (!stored) return null;

  // Replay attack: token already consumed — revoke entire family
  if (stored.used_at) {
    await prisma.refreshToken.updateMany({
      where: { family_id: stored.family_id },
      data: { revoked_at: new Date() },
    });
    return null;
  }

  if (stored.revoked_at || stored.expires_at < new Date()) return null;

  const { session_account: account } = stored;
  if (account.revoked_at) return null;
  if (account.session.revoked_at || account.session.expires_at < new Date()) return null;
  if (account.user.status !== UserStatus.ACTIVE) return null;

  const newRaw = generateRawRefreshToken();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { token_id: stored.token_id },
      data: { used_at: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        session_account_id: stored.session_account_id,
        token_hash: hashToken(newRaw),
        family_id: stored.family_id,
        parent_token_id: stored.token_id,
        expires_at: expiresAt(),
      },
    }),
    prisma.sessionAccount.update({
      where: { session_account_id: stored.session_account_id },
      data: { last_used_at: new Date() },
    }),
  ]);

  return { user: account.user, newRaw };
}

// Revoke a token by its raw value (mobile logout — best effort).
export async function revokeRefreshToken(raw: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { token_hash: hashToken(raw), revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

// Revoke all tokens for a session account (session revocation).
export async function revokeTokensBySessionAccount(sessionAccountId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { session_account_id: sessionAccountId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

// Revoke all tokens for a user across all sessions.
export async function revokeAllTokensForUser(userId: string): Promise<void> {
  const accounts = await prisma.sessionAccount.findMany({
    where: { user_id: userId },
    select: { session_account_id: true },
  });
  const ids = accounts.map((a) => a.session_account_id);
  if (ids.length === 0) return;
  await prisma.refreshToken.updateMany({
    where: { session_account_id: { in: ids }, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}
