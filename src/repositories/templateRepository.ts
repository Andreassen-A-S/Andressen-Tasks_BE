import { prisma } from "../db/prisma";
import type { Prisma, RecurringTaskTemplate } from "../generated/prisma/client";

/**
 * Template repository with transaction support
 * All methods accept an optional transaction client
 */

type TransactionClient = Prisma.TransactionClient;
type PrismaClient = typeof prisma | TransactionClient;

export async function getAllTemplates(client: PrismaClient = prisma) {
  return client.recurringTaskTemplate.findMany();
}

export async function createTemplate(
  data: Prisma.RecurringTaskTemplateCreateInput,
  client: PrismaClient = prisma,
) {
  return client.recurringTaskTemplate.create({ data });
}

export async function updateTemplate(
  id: string,
  data: Prisma.RecurringTaskTemplateUpdateInput,
  client: PrismaClient = prisma,
): Promise<RecurringTaskTemplate> {
  return client.recurringTaskTemplate.update({ where: { id }, data });
}

export async function getActiveTemplates(client: PrismaClient = prisma) {
  return client.recurringTaskTemplate.findMany({ where: { is_active: true } });
}

export async function getTemplateById(
  id: string,
  client: PrismaClient = prisma,
) {
  return client.recurringTaskTemplate.findUnique({ where: { id } });
}
