import { PrismaClient } from "../generated/prisma/client";

export const prisma = new PrismaClient({
  log: ["query", "error", "warn"],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
