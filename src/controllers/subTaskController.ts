import * as taskRepo from "../repositories/taskRepository";
import * as taskEventRepo from "../repositories/taskEventRepository";
import { TaskEventType } from "../generated/prisma/client";
import type { Request, Response } from "express";

export async function createSubtask(req: Request, res: Response) {
  try {
    const { parent_task_id, ...subtaskData } = req.body;

    if (!parent_task_id) {
      return res
        .status(400)
        .json({ success: false, error: "parent_task_id is required" });
    }

    const parentTask = await taskRepo.getTaskById(parent_task_id);
    if (!parentTask) {
      return res
        .status(404)
        .json({ success: false, error: "Parent task not found" });
    }

    // Create subtask + assignments (safe)
    const subtask = await taskRepo.createTaskWithAssignments({
      ...subtaskData,
      parent_task_id,
    });

    // SUBTASK_ADDED event on parent
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: parent_task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.SUBTASK_ADDED,
      message: "Subtask created",
      before_json: {},
      after_json: subtask ?? {},
    });

    // TASK_CREATED event on subtask
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: subtask!.task_id } },
      actor: { connect: { user_id: req.user!.user_id } },
      type: TaskEventType.TASK_CREATED,
      message: "Task created",
      before_json: {},
      after_json: subtask ?? {},
    });

    res.status(201).json({ success: true, data: subtask });
  } catch (error) {
    console.error("Error in createSubtask:", error);
    res.status(400).json({ success: false, error: "Failed to create subtask" });
  }
}
