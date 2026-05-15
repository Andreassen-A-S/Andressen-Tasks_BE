import type { Request, Response } from "express";
import * as subTaskService from "../services/subTaskService";
import { getRequestContext } from "../types/requestContext";

export async function createSubtask(req: Request, res: Response) {
  const { parent_task_id, ...subtaskData } = req.body;
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const subtask = await subTaskService.createSubtask(ctx, parent_task_id, subtaskData);

  res.status(201).json({ success: true, data: subtask });
}
