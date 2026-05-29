import type { Request, Response } from "express";
import { getRequestContext } from "../types/requestContext";
import { getParamId } from "../helper/helpers";
import * as goalService from "../services/goalService";
import type { TaskUnit } from "../generated/prisma/client";

export async function setGoal(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const taskId = getParamId(req, "taskId");
  if (!taskId) return res.status(400).json({ success: false, error: "Missing task ID" });

  const { target_quantity, unit } = req.body as { target_quantity: number; unit: TaskUnit };
  if (!target_quantity || !unit) {
    return res.status(400).json({ success: false, error: "target_quantity and unit are required" });
  }

  const goal = await goalService.setGoal(ctx, taskId, { target_quantity, unit });
  return res.json({ success: true, data: goal });
}

export async function removeGoal(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const taskId = getParamId(req, "taskId");
  if (!taskId) return res.status(400).json({ success: false, error: "Missing task ID" });

  const removed = await goalService.removeGoal(ctx, taskId);
  if (!removed) return res.status(404).json({ success: false, error: "No active goal found" });
  return res.json({ success: true });
}
