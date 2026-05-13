import type { Request, Response } from "express";
import * as assignmentService from "../services/assignmentService";
import { getRequestContext } from "../types/requestContext";
import { getParamId } from "../helper/helpers";
import {
  AssignmentNotFoundError,
  AssignmentCrossOrganizationError,
  TaskArchivedError,
} from "../errors/domainErrors";

function handleDomainError(error: unknown, res: Response, fallbackMessage: string): Response {
  if (error instanceof AssignmentNotFoundError) {
    return res.status(404).json({ success: false, error: "Assignment not found" });
  }
  if (error instanceof AssignmentCrossOrganizationError) {
    return res.status(403).json({ success: false, error: error.message });
  }
  if (error instanceof TaskArchivedError) {
    return res.status(409).json({ success: false, error: "Task is archived and cannot be modified." });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, error: fallbackMessage });
}

// List all assignments (with optional filters by userId or taskId).
export async function listAssignments(req: Request, res: Response) {
  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { userId, taskId } = req.query;
    const assignments = await assignmentService.listAssignments(
      ctx,
      typeof userId === "string" ? userId : undefined,
      typeof taskId === "string" ? taskId : undefined,
    );

    res.json({ success: true, data: assignments });
  } catch (error) {
    console.error("Error in listAssignments:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch assignments" });
  }
}

// Assign a user to a task. Requires admin or super-admin role (enforced by route middleware).
export async function assignTask(req: Request, res: Response) {
  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { task_id, user_id } = req.body;

    const assignment = await assignmentService.assignTaskToUser(ctx, task_id, user_id);

    if (assignment === null) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    if (error instanceof AssignmentCrossOrganizationError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    if (error instanceof TaskArchivedError) {
      return res.status(409).json({ success: false, error: "Task is archived and cannot be modified." });
    }
    console.error("Error in assignTask:", error);
    const message = error instanceof Error ? error.message : "Failed to assign task";
    return res.status(400).json({ success: false, error: message });
  }
}

// Get a specific assignment by ID.
export async function getAssignment(req: Request, res: Response) {
  try {
    const id = getParamId(req);
    if (!id) return res.status(400).json({ error: "Missing or invalid id" });

    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const assignment = await assignmentService.getAssignmentById(ctx, id);

    if (!assignment) {
      return res
        .status(404)
        .json({ success: false, error: "Assignment not found" });
    }
    res.json({ success: true, data: assignment });
  } catch (error) {
    console.error("Error in getAssignment:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch assignment" });
  }
}

// Update an assignment (e.g., mark as complete). Validates existence and archived status.
export async function updateAssignment(req: Request, res: Response) {
  try {
    const id = getParamId(req);
    if (!id) return res.status(400).json({ error: "Missing or invalid id" });

    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const assignment = await assignmentService.updateAssignment(ctx, id, req.body);

    if (assignment === null) {
      return res
        .status(404)
        .json({ success: false, error: "Assignment not found" });
    }

    res.json({ success: true, data: assignment });
  } catch (error) {
    return handleDomainError(error, res, "Failed to update assignment");
  }
}

// Delete an assignment by ID. Validates existence and archived status, then logs event.
export async function deleteAssignment(req: Request, res: Response) {
  try {
    const id = getParamId(req);
    if (!id) return res.status(400).json({ error: "Missing or invalid id" });

    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    await assignmentService.deleteAssignment(ctx, id);

    res.status(204).send();
  } catch (error) {
    return handleDomainError(error, res, "Failed to delete assignment");
  }
}
