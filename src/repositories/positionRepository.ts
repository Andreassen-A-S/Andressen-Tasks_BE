import { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/prisma";
import type { Position } from "../generated/prisma/client";
import { DuplicatePositionError, PositionNotFoundError } from "../errors/domainErrors";

export { DuplicatePositionError, PositionNotFoundError } from "../errors/domainErrors";

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
  try {
    return await prisma.position.create({
      data: { name, organization_id: orgId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicatePositionError();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export async function updatePositionInOrg(positionId: string, orgId: string, name: string): Promise<Position> {
  const existing = await prisma.position.findFirst({
    where: { position_id: positionId, organization_id: orgId },
  });
  if (!existing) throw new PositionNotFoundError(positionId);

  try {
    return await prisma.position.update({ where: { position_id: positionId }, data: { name } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicatePositionError();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Deletes
// ---------------------------------------------------------------------------

export async function deletePositionInOrg(positionId: string, orgId: string): Promise<void> {
  const existing = await prisma.position.findFirst({
    where: { position_id: positionId, organization_id: orgId },
  });
  if (!existing) throw new PositionNotFoundError(positionId);

  await prisma.position.delete({ where: { position_id: positionId } });
}
