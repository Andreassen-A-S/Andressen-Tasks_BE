import type { Request, Response } from "express";
import * as subTaskService from "../services/subTaskService";
import { getRequestContext } from "../types/requestContext";
import { TaskArchivedError, TaskNotFoundError } from "../errors/domainErrors";

export async function createSubtask(req: Request, res: Response) {
  try {
    const { parent_task_id, ...subtaskData } = req.body;

    if (!parent_task_id) {
      return res
        .status(400)
        .json({ success: false, error: "parent_task_id is required" });
    }

    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const subtask = await subTaskService.createSubtask(ctx, parent_task_id, subtaskData);

    res.status(201).json({ success: true, data: subtask });
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      return res.status(404).json({ success: false, error: "Parent task not found" });
    }
    if (error instanceof TaskArchivedError) {
      return res.status(409).json({ success: false, error: "Task is archived and cannot be modified." });
    }
    console.error("Error in createSubtask:", error);
    res.status(400).json({ success: false, error: "Failed to create subtask" });
  }
}
