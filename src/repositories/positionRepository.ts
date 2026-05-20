import { prisma } from "../db/prisma";
import type { Position } from "../generated/prisma/client";
import { PositionNotFoundError } from "../errors/domainErrors";

export { PositionNotFoundError } from "../errors/domainErrors";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAllPositions(orgId: string | null): Promise<Position[]> {
  return prisma.position.findMany({
    where: orgId ? { organization_id: orgId } : undefined,
    orderBy: { name: "asc" },
  });
}

export async function getPositionById(positionId: string, orgId: string | null): Promise<Position | null> {
  return prisma.position.findFirst({
    where: { position_id: positionId, ...(orgId ? { organization_id: orgId } : {}) },
  });
}

// ---------------------------------------------------------------------------
// Creates
// ---------------------------------------------------------------------------

export async function createPosition(orgId: string, name: string): Promise<Position> {
  return prisma.position.create({
    data: { name, organization_id: orgId },
  });
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export async function updatePosition(positionId: string, orgId: string | null, name: string): Promise<Position> {
  const existing = await prisma.position.findFirst({
    where: { position_id: positionId, ...(orgId ? { organization_id: orgId } : {}) },
  });
  if (!existing) throw new PositionNotFoundError(positionId);

  return prisma.position.update({ where: { position_id: positionId }, data: { name } });
}

// ---------------------------------------------------------------------------
// Deletes
// ---------------------------------------------------------------------------

export async function deletePosition(positionId: string, orgId: string | null): Promise<void> {
  const existing = await prisma.position.findFirst({
    where: { position_id: positionId, ...(orgId ? { organization_id: orgId } : {}) },
  });
  if (!existing) throw new PositionNotFoundError(positionId);

  await prisma.position.delete({ where: { position_id: positionId } });
}
