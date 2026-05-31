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
  try {
    return await prisma.$transaction(async (tx) => {
      const result = await tx.position.updateMany({
        where: { position_id: positionId, organization_id: orgId },
        data: { name },
      });
      if (result.count === 0) throw new PositionNotFoundError(positionId);
      return tx.position.findUniqueOrThrow({ where: { position_id: positionId } });
    });
  } catch (err) {
    if (err instanceof PositionNotFoundError) throw err;
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
  const result = await prisma.position.deleteMany({
    where: { position_id: positionId, organization_id: orgId },
  });
  if (result.count === 0) throw new PositionNotFoundError(positionId);
}
