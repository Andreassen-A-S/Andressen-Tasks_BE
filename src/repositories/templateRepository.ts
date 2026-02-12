import { prisma } from "../db/prisma";
import type { Prisma } from "../generated/prisma/client";

export async function createTemplate(
  data: Prisma.RecurringTaskTemplateCreateInput,
) {
  return prisma.recurringTaskTemplate.create({ data });
}

export async function updateTemplate(
  id: string,
  data: Prisma.RecurringTaskTemplateUpdateInput,
) {
  return prisma.recurringTaskTemplate.update({ where: { id }, data });
}

export async function getActiveTemplates() {
  return prisma.recurringTaskTemplate.findMany({ where: { is_active: true } });
}

export async function getTemplateById(id: string) {
  return prisma.recurringTaskTemplate.findUnique({ where: { id } });
}
