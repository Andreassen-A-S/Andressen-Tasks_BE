import type { Request, Response } from "express";
import { RecurringTaskService } from "../services/recurringTaskService";
import type { Prisma } from "../generated/prisma/client";
import {
  validateRecurringTemplateData,
  requireUserId,
  getParamId,
} from "../helper/helpers";

const recurringService = new RecurringTaskService();

/**
 * These routes are protected by auth middleware.
 */

/**
 * GET /api/recurring-templates
 * List all recurring templates
 */
export async function listTemplates(_req: Request, res: Response) {
  try {
    const templates = await recurringService.getAllTemplates();
    return res.json({ success: true, data: templates });
  } catch (error) {
    console.error("Error in listTemplates:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch templates" });
  }
}

/**
 * GET /api/recurring-templates/active
 * List all active recurring templates
 */
export async function listActiveTemplates(_req: Request, res: Response) {
  try {
    const templates = await recurringService.getActiveTemplates();
    return res.json({ success: true, data: templates });
  } catch (error) {
    console.error("Error in listActiveTemplates:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch active templates" });
  }
}

/**
 * GET /api/recurring-templates/:id
 * Get a single template by ID
 */
export async function getTemplate(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid id" });
  }

  try {
    const template = await recurringService.getTemplateById(id);
    if (!template) {
      return res
        .status(404)
        .json({ success: false, error: "Template not found" });
    }
    return res.json({ success: true, data: template });
  } catch (error) {
    console.error("Error in getTemplate:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch template" });
  }
}

/**
 * POST /api/recurring-templates
 * Create a new recurring template
 *
 * All operations are atomic - template, assignees, and instances are created together
 */
export async function createTemplate(req: Request, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const body = req.body;

    // Validate the template data
    const validation = validateRecurringTemplateData({
      title: body.title,
      frequency: body.frequency,
      start_date: body.start_date,
      end_date: body.end_date,
      interval: body.interval,
      days_of_week: body.days_of_week,
      day_of_month: body.day_of_month,
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    // Reject if client sends a mismatching created_by
    if (body.created_by && body.created_by !== userId) {
      return res.status(400).json({
        success: false,
        error: "created_by must match the authenticated user",
      });
    }

    // Build the Prisma input
    const templateData: Prisma.RecurringTaskTemplateCreateInput = {
      title: body.title,
      description: body.description,
      priority: body.priority || "MEDIUM",
      unit: body.unit || "NONE",
      target_quantity: body.target_quantity,
      goal_type: body.goal_type || "OPEN",
      frequency: body.frequency,
      interval: body.interval || 1,
      days_of_week: body.days_of_week,
      day_of_month: body.day_of_month,
      start_date: new Date(body.start_date),
      end_date: body.end_date ? new Date(body.end_date) : undefined,
      is_active: true,
      creator: { connect: { user_id: userId } },
    };

    // Extract assignees from body (if provided)
    const assigneeUserIds =
      body.assigned_users && Array.isArray(body.assigned_users)
        ? body.assigned_users
        : undefined;

    // Create template with assignees atomically
    // This single call handles: template creation, assignee setup, and instance generation
    // If any step fails, everything rolls back automatically
    const template = await recurringService.createTemplate(
      templateData,
      assigneeUserIds,
    );

    // Fetch complete template with assignees to return to client
    const completeTemplate = await recurringService.getTemplateById(
      template.id,
    );

    return res.status(201).json({ success: true, data: completeTemplate });
  } catch (error) {
    console.error("Error in createTemplate:", error);

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes("Invalid user IDs")) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }
    }

    return res
      .status(500)
      .json({ success: false, error: "Failed to create template" });
  }
}

/**
 * PATCH /api/recurring-templates/:id
 * Update a recurring template
 *
 * All operations are atomic - template update, assignee changes, and instance regeneration
 */
export async function updateTemplate(req: Request, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const id = getParamId(req);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid id" });
  }

  try {
    const body = req.body;

    // Check if template exists and user has permission
    const existing = await recurringService.getTemplateById(id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "Template not found" });
    }

    if (existing.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to update this template",
      });
    }

    // Validate updated fields
    if (
      body.frequency !== undefined ||
      body.days_of_week !== undefined ||
      body.day_of_month !== undefined ||
      body.interval !== undefined ||
      body.start_date !== undefined ||
      body.end_date !== undefined
    ) {
      const validationData = {
        title: body.title !== undefined ? body.title : existing.title,
        frequency:
          body.frequency !== undefined ? body.frequency : existing.frequency,
        start_date:
          body.start_date !== undefined ? body.start_date : existing.start_date,
        end_date:
          body.end_date !== undefined ? body.end_date : existing.end_date,
        interval:
          body.interval !== undefined ? body.interval : existing.interval,
        days_of_week:
          body.days_of_week !== undefined
            ? body.days_of_week
            : existing.days_of_week,
        day_of_month:
          body.day_of_month !== undefined
            ? body.day_of_month
            : existing.day_of_month,
      };

      const validation = validateRecurringTemplateData(validationData);

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: validation.error,
        });
      }
    }

    // Build update data
    const updateData: Prisma.RecurringTaskTemplateUpdateInput = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.unit !== undefined) updateData.unit = body.unit;
    if (body.target_quantity !== undefined)
      updateData.target_quantity = body.target_quantity;
    if (body.goal_type !== undefined) updateData.goal_type = body.goal_type;
    if (body.frequency !== undefined) updateData.frequency = body.frequency;
    if (body.interval !== undefined) updateData.interval = body.interval;
    if (body.days_of_week !== undefined)
      updateData.days_of_week = body.days_of_week;
    if (body.day_of_month !== undefined)
      updateData.day_of_month = body.day_of_month;
    if (body.start_date !== undefined)
      updateData.start_date = new Date(body.start_date);
    if (body.end_date !== undefined)
      updateData.end_date = body.end_date ? new Date(body.end_date) : null;

    // Extract assignees (only if explicitly provided)
    const assigneeUserIds =
      body.assigned_users !== undefined && Array.isArray(body.assigned_users)
        ? body.assigned_users
        : undefined;

    // Update template atomically
    // This single call handles: template update, assignee changes, and instance regeneration
    // If any step fails, everything rolls back automatically
    const template = await recurringService.updateTemplate(
      id,
      updateData,
      assigneeUserIds,
    );

    // Fetch updated template with assignees
    const updatedTemplate = await recurringService.getTemplateById(id);

    return res.json({ success: true, data: updatedTemplate });
  } catch (error) {
    console.error("Error in updateTemplate:", error);

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes("Invalid user IDs")) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }
    }

    return res
      .status(500)
      .json({ success: false, error: "Failed to update template" });
  }
}

/**
 * DELETE /api/recurring-templates/:id
 * Delete a recurring template (and all its instances)
 */
export async function deleteTemplate(req: Request, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const id = getParamId(req);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid id" });
  }

  try {
    const template = await recurringService.getTemplateById(id);
    if (!template) {
      return res
        .status(404)
        .json({ success: false, error: "Template not found" });
    }

    if (template.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to delete this template",
      });
    }

    await recurringService.deleteTemplate(id);

    return res.status(204).send();
  } catch (error) {
    console.error("Error in deleteTemplate:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to delete template" });
  }
}

/**
 * POST /api/recurring-templates/:id/deactivate
 * Deactivate a template (stops generating new instances)
 */
export async function deactivateTemplate(req: Request, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const id = getParamId(req);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid id" });
  }

  try {
    const template = await recurringService.getTemplateById(id);
    if (!template) {
      return res
        .status(404)
        .json({ success: false, error: "Template not found" });
    }

    if (template.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to deactivate this template",
      });
    }

    const updated = await recurringService.deactivateTemplate(id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error in deactivateTemplate:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to deactivate template" });
  }
}

/**
 * POST /api/recurring-templates/:id/reactivate
 * Reactivate a template (resumes generating instances)
 */
export async function reactivateTemplate(req: Request, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const id = getParamId(req);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid id" });
  }

  try {
    const template = await recurringService.getTemplateById(id);
    if (!template) {
      return res
        .status(404)
        .json({ success: false, error: "Template not found" });
    }

    if (template.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to reactivate this template",
      });
    }

    const updated = await recurringService.reactivateTemplate(id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error in reactivateTemplate:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to reactivate template" });
  }
}

/**
 * GET /api/recurring-templates/:id/instances
 * Get all task instances for a template
 */
export async function getTemplateInstances(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid id" });
  }

  try {
    const instances = await recurringService.getTemplateInstances(id);
    return res.json({ success: true, data: instances });
  } catch (error) {
    console.error("Error in getTemplateInstances:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch instances" });
  }
}
