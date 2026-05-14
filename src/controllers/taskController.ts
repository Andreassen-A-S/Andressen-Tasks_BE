import type { Request, Response } from "express";
import {
  AssignmentNotFoundError,
  CrossOrganizationReferenceError,
  TaskAlreadyDoneError,
  TaskArchivedError,
  TaskNotFoundError,
  TaskNotProgressableError,
} from "../errors/domainErrors";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";
import { getParamId } from "../helper/helpers";
import { getRequestContext } from "../types/requestContext";
import * as taskService from "../services/taskService";

/**
 * These routes are protected by auth middleware.
 * Kept as a safety net for robust controller behavior.
 */

// ---------------------------------------------------------------------------
// Domain error → HTTP status mapper
// Centralises all repository error handling so each handler stays clean.
// ---------------------------------------------------------------------------

function handleDomainError(
  error: unknown,
  res: Response,
  fallbackMessage: string,
): Response {
  if (error instanceof TaskNotFoundError) {
    return res.status(404).json({ success: false, error: error.message });
  }
  if (error instanceof TaskArchivedError) {
    return res.status(409).json({ success: false, error: error.message });
  }
  if (error instanceof TaskAlreadyDoneError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error instanceof TaskNotProgressableError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error instanceof AssignmentNotFoundError) {
    return res.status(404).json({ success: false, error: error.message });
  }
  if (error instanceof CrossOrganizationReferenceError) {
    return res.status(403).json({ success: false, error: error.message });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, error: fallbackMessage });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function listTasks(req: Request, res: Response) {
  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
    const tasks = await taskService.listTasks(ctx);
    return res.json({ success: true, data: tasks });
  } catch (error) {
    console.error("Error in listTasks:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch tasks" });
  }
}

export async function getTask(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid id" });
  }

  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
    const task = await taskService.getTask(ctx, id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    return res.json({ success: true, data: task });
  } catch (error) {
    console.error("Error in getTask:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch task" });
  }
}

export async function createTask(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
    const body = req.body as CreateTaskInput;

    // TODO: move to Zod schema middleware
    if (
      !body.project_id ||
      typeof body.project_id !== "string" ||
      body.project_id.trim() === ""
    ) {
      return res
        .status(400)
        .json({ success: false, error: "project_id is required" });
    }

    const input: CreateTaskInput = {
      ...body,
      created_by: ctx.actorUserId,
      project_id: body.project_id.trim(),
    };
    const task = await taskService.createTask(ctx, input);

    if (!task) {
      return res
        .status(500)
        .json({ success: false, error: "Failed to create task" });
    }

    return res.status(201).json({ success: true, data: task });
  } catch (error) {
    return handleDomainError(error, res, "Failed to create task");
  }
}

export async function updateTask(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const id = getParamId(req);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid id" });
  }

  try {
    const updateData = req.body as UpdateTaskInput;
    const updatedTask = await taskService.updateTask(ctx, id, updateData);
    if (!updatedTask) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    return res.json({ success: true, data: updatedTask });
  } catch (error) {
    return handleDomainError(error, res, "Failed to update task");
  }
}

export async function deleteTask(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const id = getParamId(req);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid id" });
  }

  try {
    const deleted = await taskService.deleteTask(ctx, id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    return res.status(204).send();
  } catch (error) {
    return handleDomainError(error, res, "Failed to delete task");
  }
}

export async function upsertProgressLog(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const taskId = getParamId(req);
  if (!taskId) {
    return res.status(400).json({ success: false, error: "Invalid task ID" });
  }

  const { quantity_done, unit, note } = req.body;

  if (typeof quantity_done !== "number" || quantity_done <= 0) {
    return res.status(400).json({
      success: false,
      error: "quantity_done must be a positive number",
    });
  }

  try {
    const data = await taskService.upsertProgressLog(
      ctx,
      taskId,
      quantity_done,
      unit,
      note,
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleDomainError(error, res, "Failed to upsert progress log");
  }
}
