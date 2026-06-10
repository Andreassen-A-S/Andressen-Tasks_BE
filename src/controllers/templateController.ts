import type { Request, Response } from "express";
import { RecurringTaskService } from "../services/recurringTaskService";
import { validateRecurringTemplateData, getParamId } from "../helper/helpers";
import { RecurrenceFrequency } from "../generated/prisma/client";
import { getRequestContext } from "../types/requestContext";
import { ValidationError } from "../errors/domainErrors";
import type { CreateTemplateInput, UpdateTemplateInput } from "../types/template";

const recurringService = new RecurringTaskService();

export async function listTemplates(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const templates = await recurringService.getAllTemplates(ctx.effectiveOrgId);
  return res.json({ success: true, data: templates });
}

export async function listActiveTemplates(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const templates = await recurringService.getActiveTemplates(ctx.effectiveOrgId);
  return res.json({ success: true, data: templates });
}

export async function getTemplate(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const template = await recurringService.getTemplateById(id, ctx.effectiveOrgId);
  if (!template) return res.status(404).json({ success: false, error: "Template not found" });
  return res.json({ success: true, data: template });
}

export async function createTemplate(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const userId = ctx.actorUserId;

  const body = req.body;

  if (body.created_by && body.created_by !== userId) {
    return res.status(400).json({ success: false, error: "created_by must match the authenticated user" });
  }

  const templateData: CreateTemplateInput = {
    title: body.title,
    description: body.description,
    priority: body.priority,
    frequency: body.frequency,
    interval: body.interval,
    days_of_week: body.days_of_week,
    day_of_month: body.day_of_month,
    start_date: new Date(body.start_date),
    end_date: body.end_date ? new Date(body.end_date) : undefined,
    project_id: body.project_id.trim(),
    created_by: userId,
    assigned_users: Array.isArray(body.assigned_users) ? body.assigned_users : undefined,
    goal: body.goal ?? undefined,
  };

  const template = await recurringService.createTemplate(ctx, templateData, ctx.effectiveOrgId);
  const completeTemplate = await recurringService.getTemplateById(template.id, ctx.effectiveOrgId);

  return res.status(201).json({ success: true, data: completeTemplate });
}

export async function updateTemplate(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const body = req.body;

  const existing = await recurringService.getTemplateById(id, ctx.effectiveOrgId);
  if (!existing) return res.status(404).json({ success: false, error: "Template not found" });

  if (
    body.frequency !== undefined ||
    body.days_of_week !== undefined ||
    body.day_of_month !== undefined ||
    body.interval !== undefined ||
    body.start_date !== undefined ||
    body.end_date !== undefined
  ) {
    const targetFrequency = body.frequency !== undefined ? body.frequency : existing.frequency;

    const validationData = {
      title: body.title !== undefined ? body.title : existing.title,
      frequency: body.frequency !== undefined ? body.frequency : existing.frequency,
      start_date: body.start_date !== undefined ? body.start_date : existing.start_date,
      end_date: body.end_date !== undefined ? body.end_date : existing.end_date,
      interval: body.interval !== undefined ? body.interval : existing.interval,
      days_of_week:
        targetFrequency === RecurrenceFrequency.WEEKLY
          ? body.days_of_week !== undefined
            ? body.days_of_week
            : existing.days_of_week
          : undefined,
      day_of_month:
        targetFrequency === RecurrenceFrequency.MONTHLY
          ? body.day_of_month !== undefined
            ? body.day_of_month
            : existing.day_of_month
          : undefined,
    };

    const validation = validateRecurringTemplateData(validationData);
    if (!validation.isValid) {
      throw new ValidationError(validation.error!);
    }
  }

  const updateData: UpdateTemplateInput = {};

  if (body.title !== undefined) updateData.title = body.title;
  if (body.project_id !== undefined) updateData.project_id = body.project_id.trim();
  if (body.description !== undefined) updateData.description = body.description;
  if (body.priority !== undefined) updateData.priority = body.priority;
  if (body.goal !== undefined) updateData.goal = body.goal ?? null;
  if (body.frequency !== undefined) updateData.frequency = body.frequency;
  if (body.interval !== undefined) updateData.interval = body.interval;
  if (body.days_of_week !== undefined) updateData.days_of_week = body.days_of_week;
  if (body.day_of_month !== undefined) updateData.day_of_month = body.day_of_month;
  if (body.start_date !== undefined) updateData.start_date = new Date(body.start_date);
  if (body.end_date !== undefined) updateData.end_date = body.end_date ? new Date(body.end_date) : null;
  if (body.assigned_users !== undefined && Array.isArray(body.assigned_users)) {
    updateData.assigned_users = body.assigned_users;
  }

  await recurringService.updateTemplate(ctx, id, updateData, ctx.effectiveOrgId);
  const updatedTemplate = await recurringService.getTemplateById(id, ctx.effectiveOrgId);

  return res.json({ success: true, data: updatedTemplate });
}

export async function deleteTemplate(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  await recurringService.deleteTemplate(ctx, id, ctx.effectiveOrgId);
  return res.status(204).send();
}

export async function deactivateTemplate(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const updated = await recurringService.deactivateTemplate(ctx, id, ctx.effectiveOrgId);
  return res.json({ success: true, data: updated });
}

export async function reactivateTemplate(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const updated = await recurringService.reactivateTemplate(ctx, id, ctx.effectiveOrgId);
  return res.json({ success: true, data: updated });
}

export async function getTemplateInstances(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const instances = await recurringService.getTemplateInstances(id, ctx.effectiveOrgId);
  return res.json({ success: true, data: instances });
}
