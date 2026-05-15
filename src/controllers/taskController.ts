import type { Request, Response } from "express";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";
import { getParamId } from "../helper/helpers";
import { getRequestContext } from "../types/requestContext";
import * as taskService from "../services/taskService";

export async function listTasks(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const tasks = await taskService.listTasks(ctx);
  return res.json({ success: true, data: tasks });
}

export async function getTask(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const task = await taskService.getTask(ctx, id);
  if (!task) return res.status(404).json({ success: false, error: "Task not found" });
  return res.json({ success: true, data: task });
}

export async function createTask(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const body = req.body as CreateTaskInput;
  const task = await taskService.createTask(ctx, {
    ...body,
    created_by: ctx.actorUserId,
    project_id: body.project_id.trim(),
  });

  if (!task) return res.status(500).json({ success: false, error: "Failed to create task" });

  return res.status(201).json({ success: true, data: task });
}

export async function updateTask(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const updatedTask = await taskService.updateTask(ctx, id, req.body as UpdateTaskInput);
  if (!updatedTask) return res.status(404).json({ success: false, error: "Task not found" });
  return res.json({ success: true, data: updatedTask });
}

export async function deleteTask(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const deleted = await taskService.deleteTask(ctx, id);
  if (!deleted) return res.status(404).json({ success: false, error: "Task not found" });
  return res.status(204).send();
}

export async function upsertProgressLog(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const taskId = getParamId(req);
  if (!taskId) return res.status(400).json({ success: false, error: "Invalid task ID" });

  const { quantity_done, unit, note } = req.body;
  const data = await taskService.upsertProgressLog(ctx, taskId, quantity_done, unit, note);
  return res.json({ success: true, data });
}
