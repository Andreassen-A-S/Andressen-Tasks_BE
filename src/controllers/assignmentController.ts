import type { Request, Response } from "express";
import * as assignmentService from "../services/assignmentService";
import { getRequestContext } from "../types/requestContext";
import { getParamId } from "../helper/helpers";

// List all assignments (with optional filters by userId or taskId).
export async function listAssignments(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { userId, taskId } = req.query;
  const assignments = await assignmentService.listAssignments(
    ctx,
    typeof userId === "string" ? userId : undefined,
    typeof taskId === "string" ? taskId : undefined,
  );

  res.json({ success: true, data: assignments });
}

// Assign a user to a task. Requires admin or super-admin role (enforced by route middleware).
export async function assignTask(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { task_id, user_id } = req.body;
  const assignment = await assignmentService.assignTaskToUser(ctx, task_id, user_id);

  if (assignment === null) {
    return res.status(404).json({ success: false, error: "Task not found" });
  }

  res.status(201).json({ success: true, data: assignment });
}

// Get a specific assignment by ID.
export async function getAssignment(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const assignment = await assignmentService.getAssignmentById(ctx, id);

  if (!assignment) return res.status(404).json({ success: false, error: "Assignment not found" });
  res.json({ success: true, data: assignment });
}

// Update an assignment (e.g., mark as complete). Validates existence and archived status.
export async function updateAssignment(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const assignment = await assignmentService.updateAssignment(ctx, id, req.body);

  if (assignment === null) return res.status(404).json({ success: false, error: "Assignment not found" });

  res.json({ success: true, data: assignment });
}

// Delete an assignment by ID. Validates existence and archived status, then logs event.
export async function deleteAssignment(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  await assignmentService.deleteAssignment(ctx, id);

  res.status(204).send();
}
