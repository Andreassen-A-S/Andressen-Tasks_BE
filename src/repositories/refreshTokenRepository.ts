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

// Rotate a token: atomically consume old, create replacement, extend session.
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
          session: { select: { session_id: true, revoked_at: true, expires_at: true } },
        },
      },
    },
  });

  if (!stored) return null;

  // Replay: already consumed — revoke family and session account
  if (stored.used_at) {
    await prisma.$transaction([
      prisma.refreshToken.updateMany({
        where: { family_id: stored.family_id },
        data: { revoked_at: new Date() },
      }),
      prisma.sessionAccount.updateMany({
        where: { session_account_id: stored.session_account_id, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
    ]);
    return null;
  }

  if (stored.revoked_at || stored.expires_at < new Date()) return null;

  const { session_account: account } = stored;
  if (account.revoked_at) return null;
  if (account.session.revoked_at || account.session.expires_at < new Date()) return null;
  if (account.user.status !== UserStatus.ACTIVE) return null;

  const newRaw = generateRawRefreshToken();
  const now = new Date();

  const rotated = await prisma.$transaction(async (tx) => {
    // Conditional consume: 0 rows means concurrent rotation — treat as replay
    const consumed = await tx.refreshToken.updateMany({
      where: { token_id: stored.token_id, used_at: null, revoked_at: null },
      data: { used_at: now },
    });
    if (consumed.count === 0) {
      await Promise.all([
        tx.refreshToken.updateMany({
          where: { family_id: stored.family_id },
          data: { revoked_at: now },
        }),
        tx.sessionAccount.updateMany({
          where: { session_account_id: stored.session_account_id, revoked_at: null },
          data: { revoked_at: now },
        }),
      ]);
      return false;
    }

    await Promise.all([
      tx.refreshToken.create({
        data: {
          session_account_id: stored.session_account_id,
          token_hash: hashToken(newRaw),
          family_id: stored.family_id,
          parent_token_id: stored.token_id,
          expires_at: expiresAt(),
        },
      }),
      tx.sessionAccount.update({
        where: { session_account_id: stored.session_account_id },
        data: { last_used_at: now },
      }),
      tx.session.update({
        where: { session_id: account.session.session_id },
        data: { expires_at: expiresAt(30) },
      }),
    ]);
    return true;
  });

  if (!rotated) return null;
  return { user: account.user, newRaw };
}

// Revoke a token by its raw value (mobile logout). Returns session_account_id if found.
export async function revokeRefreshToken(raw: string): Promise<string | null> {
  const token = await prisma.refreshToken.findUnique({
    where: { token_hash: hashToken(raw) },
    select: { token_id: true, session_account_id: true, revoked_at: true },
  });
  if (!token || token.revoked_at) return null;
  await prisma.refreshToken.update({
    where: { token_id: token.token_id },
    data: { revoked_at: new Date() },
  });
  return token.session_account_id;
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
