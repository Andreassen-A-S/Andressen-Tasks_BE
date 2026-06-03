import { prisma } from "../db/prisma";
import { generateRawRefreshToken, hashToken } from "../utils/tokenUtils";
import { UserStatus } from "../generated/prisma/client";

function expiresAt(days = 30): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function createRefreshToken(userId: string, deviceName?: string, location?: string): Promise<string> {
  const raw = generateRawRefreshToken();
  await prisma.refreshToken.create({
    data: { user_id: userId, token_hash: hashToken(raw), expires_at: expiresAt(), device_name: deviceName ?? null, location: location ?? null },
  });
  return raw;
}

export async function rotateRefreshToken(raw: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token_hash: hashToken(raw) },
    include: {
      user: {
        select: {
          user_id: true,
          role: true,
          email: true,
          name: true,
          organization_id: true,
          status: true,
        },
      },
    },
  });

  if (!stored || stored.revoked_at || stored.expires_at < new Date()) return null;
  if (stored.user.status !== UserStatus.ACTIVE) return null;

  const newRaw = generateRawRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { token_id: stored.token_id },
      data: { revoked_at: new Date() },
    }),
    prisma.refreshToken.create({
      data: { user_id: stored.user_id, token_hash: hashToken(newRaw), expires_at: expiresAt() },
    }),
  ]);

  return { user: stored.user, newRaw };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { token_hash: hashToken(raw), revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

export async function getActiveTokensForUser(userId: string) {
  return prisma.refreshToken.findMany({
    where: { user_id: userId, revoked_at: null, expires_at: { gt: new Date() } },
    select: { token_id: true, created_at: true, expires_at: true, device_name: true, location: true },
    orderBy: { created_at: "desc" },
  });
}

export async function revokeAllTokensForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

export async function revokeTokenById(tokenId: string, userId: string): Promise<boolean> {
  const result = await prisma.refreshToken.updateMany({
    where: { token_id: tokenId, user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
  return result.count > 0;
}
