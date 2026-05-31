import { prisma } from "../db/prisma";
import type { Prisma, RecurringTaskTemplate } from "../generated/prisma/client";
import { UserRole, UserStatus } from "../generated/prisma/client";
import { CrossOrganizationReferenceError, TemplateNotFoundError } from "../errors/domainErrors";
import type { DbClient } from "../types/db";
import type { CreateTemplateInput, UpdateTemplateInput } from "../types/template";

type PrismaClient = typeof prisma | Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

async function resolveProjectOrgId(
  client: DbClient,
  projectId: string,
  effectiveOrgId: string | null,
): Promise<string> {
  const project = await (client as any).project.findFirst({
    where: {
      project_id: projectId,
      ...(effectiveOrgId ? { organization_id: effectiveOrgId } : {}),
    },
    select: { organization_id: true },
  });
  if (!project) throw new CrossOrganizationReferenceError("Project not found in organization.");
  return project.organization_id;
}

async function assertUsersInOrg(
  client: DbClient,
  userIds: string[] | undefined,
  organizationId: string,
): Promise<void> {
  if (!userIds || userIds.length === 0) return;
  const uniqueUserIds = Array.from(new Set(userIds));
  const users = await (client as any).user.findMany({
    where: {
      user_id: { in: uniqueUserIds },
      organization_id: organizationId,
      role: { not: UserRole.SYSTEM },
      status: UserStatus.ACTIVE,
    },
    select: { user_id: true },
  });
  if (users.length !== uniqueUserIds.length) {
    throw new CrossOrganizationReferenceError("Assigned users must belong to the template organization.");
  }
}

export async function getAllTemplates(orgId: string | null = null, client: PrismaClient = prisma) {
  return client.recurringTaskTemplate.findMany({
    where: orgId ? { project: { organization_id: orgId } } : undefined,
  });
}

export async function createTemplateWithAssignees(
  db: DbClient,
  data: CreateTemplateInput,
  effectiveOrgId: string | null,
): Promise<RecurringTaskTemplate> {
  const projectOrgId = await resolveProjectOrgId(db, data.project_id, effectiveOrgId);
  await assertUsersInOrg(db, data.assigned_users, projectOrgId);

  const template = await (db as any).recurringTaskTemplate.create({
    data: {
      title: data.title,
      description: data.description,
      priority: data.priority ?? "MEDIUM",
      frequency: data.frequency,
      interval: data.interval ?? 1,
      days_of_week: data.days_of_week ?? null,
      day_of_month: data.day_of_month ?? null,
      start_date: data.start_date,
      end_date: data.end_date ?? null,
      is_active: true,
      creator: { connect: { user_id: data.created_by } },
      project: { connect: { project_id: data.project_id } },
      ...(data.goal ? {
        goal: {
          create: {
            target_quantity: data.goal.target_quantity,
            current_quantity: data.goal.current_quantity ?? 0,
            unit: data.goal.unit,
          },
        },
      } : {}),
    },
  });

  if (data.assigned_users && data.assigned_users.length > 0) {
    await (db as any).recurringTaskTemplateAssignee.createMany({
      data: data.assigned_users.map((userId) => ({
        template_id: template.id,
        user_id: userId,
      })),
      skipDuplicates: true,
    });
  }

  return template;
}

export async function updateTemplateWithAssignees(
  db: DbClient,
  id: string,
  data: UpdateTemplateInput,
  effectiveOrgId: string | null,
): Promise<RecurringTaskTemplate> {
  const existing = await (db as any).recurringTaskTemplate.findFirst({
    where: {
      id,
      ...(effectiveOrgId ? { project: { organization_id: effectiveOrgId } } : {}),
    },
    select: { project: { select: { organization_id: true } }, goal: { select: { goal_id: true } } },
  });
  if (!existing) throw new TemplateNotFoundError(id);

  const projectOrgId = data.project_id
    ? await resolveProjectOrgId(db, data.project_id, effectiveOrgId)
    : existing.project.organization_id;

  if (data.project_id && projectOrgId !== existing.project.organization_id) {
    throw new CrossOrganizationReferenceError("Template cannot be moved to a project in another organization.");
  }

  if (data.assigned_users !== undefined) {
    await assertUsersInOrg(db, data.assigned_users, projectOrgId);
  }

  const updateInput: Prisma.RecurringTaskTemplateUpdateInput = {};
  if (data.title !== undefined) updateInput.title = data.title;
  if (data.description !== undefined) updateInput.description = data.description;
  if (data.priority !== undefined) updateInput.priority = data.priority;
  if (data.frequency !== undefined) updateInput.frequency = data.frequency;
  if (data.interval !== undefined) updateInput.interval = data.interval;
  if (data.days_of_week !== undefined) updateInput.days_of_week = data.days_of_week;
  if (data.day_of_month !== undefined) updateInput.day_of_month = data.day_of_month;
  if (data.start_date !== undefined) updateInput.start_date = data.start_date;
  if (data.end_date !== undefined) updateInput.end_date = data.end_date;
  if (data.project_id !== undefined) updateInput.project = { connect: { project_id: data.project_id } };
  if (data.goal !== undefined) {
    if (data.goal !== null) {
      updateInput.goal = {
        upsert: {
          create: { target_quantity: data.goal.target_quantity, current_quantity: data.goal.current_quantity ?? 0, unit: data.goal.unit },
          update: { target_quantity: data.goal.target_quantity, current_quantity: data.goal.current_quantity ?? 0, unit: data.goal.unit },
        },
      };
    } else if (existing.goal) {
      updateInput.goal = { delete: true };
    }
  }

  const template = await (db as any).recurringTaskTemplate.update({ where: { id }, data: updateInput });

  if (data.assigned_users !== undefined) {
    await (db as any).recurringTaskTemplateAssignee.deleteMany({ where: { template_id: id } });
    if (data.assigned_users.length > 0) {
      await (db as any).recurringTaskTemplateAssignee.createMany({
        data: data.assigned_users.map((userId) => ({ template_id: id, user_id: userId })),
        skipDuplicates: true,
      });
    }
  }

  return template;
}

export async function updateTemplate(
  id: string,
  data: Prisma.RecurringTaskTemplateUpdateInput,
  client: PrismaClient = prisma,
): Promise<RecurringTaskTemplate> {
  return (client as any).recurringTaskTemplate.update({ where: { id }, data });
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
