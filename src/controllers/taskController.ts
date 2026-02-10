import * as taskRepo from "../repositories/taskRepository";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";
import type { Request, Response } from "express";
import * as taskEventRepo from "../repositories/taskEventRepository";
import { TaskEventType } from "../generated/prisma/client";

// interface TaskParams {
//   id: string;
// }

export async function listTasks(req: Request, res: Response) {
  try {
    const tasks = await taskRepo.getAllTasks();
    res.json({ success: true, data: tasks });
  } catch (error) {
    console.error("Error in listTasks:", error);
    res.status(500).json({ success: false, error: "Failed to fetch tasks" });
  }
}

export async function getTask(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ error: "Missing or invalid id" });
    }
    const task = await taskRepo.getTaskById(id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    res.json({ success: true, data: task });
  } catch (error) {
    console.error("Error in getTask:", error);
    res.status(500).json({ success: false, error: "Failed to fetch task" });
  }
}

export async function createTask(req: Request, res: Response) {
  try {
    const body = req.body as CreateTaskInput;

    if (!body.created_by) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: created_by",
      });
    }

    // Use the new function that supports assignments
    const task = await taskRepo.createTaskWithAssignments(body);

    if (!task) {
      return res
        .status(404)
        .json({ success: false, error: "Task not found or update failed" });
    }

    // TaskEvent logic
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: task.task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.TASK_CREATED,
      message: "Task created",
      before_json: {},
      after_json: task,
    });

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error("Error in createTask:", error);
    res.status(400).json({ success: false, error: "Failed to create task" });
  }
}

export async function updateTask(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ error: "Missing or invalid id" });
    }
    const updateData = req.body as UpdateTaskInput;

    // Fetch the current task before updating
    const oldTask = await taskRepo.getTaskById(id);

    // Use the function with assignments if assigned_users is provided
    const task =
      updateData.assigned_users !== undefined
        ? await taskRepo.updateTaskWithAssignments(id, updateData)
        : await taskRepo.updateTask(id, updateData);

    if (!task) {
      return res
        .status(404)
        .json({ success: false, error: "Task not found or update failed" });
    }

    // Add TaskEvent logic
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: task.task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.TASK_UPDATED,
      message: "Task updated",
      before_json: oldTask ?? undefined,
      after_json: task,
    });

    res.json({ success: true, data: task });
  } catch (error) {
    console.error("Error in updateTask:", error);
    res.status(500).json({ success: false, error: "Failed to update task" });
  }
}

export async function deleteTask(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ error: "Missing or invalid id" });
    }
    const task = await taskRepo.getTaskById(id);

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    // TaskEvent logic
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: task.task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.TASK_DELETED,
      message: "Task deleted",
      before_json: task,
      after_json: {},
    });

    await taskRepo.deleteTask(id);

    res.status(204).send();
  } catch (error) {
    console.error("Error in deleteTask:", error);
    res.status(404).json({ success: false, error: "Task not found" });
  }
}

// TODO: This is probably redundant with the new event logging in the progress log upsert. We can decide to remove it or keep it for more granular events.

export async function upsertProgressLog(req: Request, res: Response) {
  const { id: taskId } = req.params;
  const { quantity_done, note } = req.body;
  const userId = req.user?.user_id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: user not found in token",
    });
  }

  if (typeof taskId !== "string") {
    return res.status(400).json({ success: false, error: "Invalid task ID" });
  }

  try {
    const progressLog = await taskRepo.upsertProgressLog(
      taskId,
      userId,
      quantity_done,
      note,
    );

    // Add TaskEvent logic
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: taskId } },
      actor: { connect: { user_id: userId } },
      type: TaskEventType.PROGRESS_LOGGED,
      message: "Progress logged",
      before_json: {},
      after_json: progressLog,
    });

    res.json({ success: true, data: progressLog });
  } catch (error) {
    res
      .status(400)
      .json({ success: false, error: "Failed to upsert progress log" });
  }
}
