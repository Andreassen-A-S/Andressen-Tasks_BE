import * as taskRepo from "../repositories/taskRepository";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";
import type { Request, Response } from "express";
import * as taskEventRepo from "../repositories/taskEventRepository";
import { TaskEventType, TaskUnit } from "../generated/prisma/client";

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

    // Log individual events for each assignment
    if (task.assignments && task.assignments.length > 0) {
      for (const assignment of task.assignments) {
        await taskEventRepo.createTaskEvent({
          task: { connect: { task_id: task.task_id } },
          actor: req.user?.user_id
            ? { connect: { user_id: req.user.user_id } }
            : undefined,
          assignment: {
            connect: { assignment_id: assignment.assignment_id },
          },
          type: TaskEventType.ASSIGNMENT_CREATED,
          message: `Created assignment`,
          before_json: undefined,
          after_json: assignment,
        });
      }
    }

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error("Error in createTask:", error);
    res.status(400).json({ success: false, error: "Failed to create task" });
  }
}

export async function updateTask(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id))
      return res.status(400).json({ error: "Missing or invalid id" });

    const updateData = req.body as UpdateTaskInput;

    // Fetch "before" including assignments for diffing
    const oldTask = await taskRepo.getTaskByIdWithAssignments(id);
    if (!oldTask)
      return res.status(404).json({ success: false, error: "Task not found" });

    // Perform update (with assignments if provided)
    const updatedTask = await taskRepo.updateTaskWithAssignments(
      id,
      updateData,
    );

    if (!updatedTask) {
      return res
        .status(404)
        .json({ success: false, error: "Task not found or update failed" });
    }

    // ---- ASSIGNMENT EVENTS (ONLY IF assigned_users WAS SENT) ----
    if (updateData.assigned_users !== undefined) {
      const oldByUser = new Map(oldTask.assignments.map((a) => [a.user_id, a]));
      const newByUser = new Map(
        updatedTask.assignments.map((a) => [a.user_id, a]),
      );

      const added = updatedTask.assignments.filter(
        (a) => !oldByUser.has(a.user_id),
      );
      const removed = oldTask.assignments.filter(
        (a) => !newByUser.has(a.user_id),
      );

      // Added assignees
      for (const assignment of added) {
        await taskEventRepo.createTaskEvent({
          task: { connect: { task_id: updatedTask.task_id } },
          actor: req.user?.user_id
            ? { connect: { user_id: req.user.user_id } }
            : undefined,
          assignment: { connect: { assignment_id: assignment.assignment_id } },
          type: TaskEventType.ASSIGNMENT_CREATED,
          message: `Created assignment`,
          before_json: undefined,
          after_json: assignment,
        });
      }

      // Removed assignees (assignment row is deleted now, so you can’t connect it)
      for (const assignment of removed) {
        await taskEventRepo.createTaskEvent({
          task: { connect: { task_id: updatedTask.task_id } },
          actor: req.user?.user_id
            ? { connect: { user_id: req.user.user_id } }
            : undefined,
          type: TaskEventType.ASSIGNMENT_DELETED,
          message: `Deleted assignment`,
          before_json: assignment,
          after_json: {},
        });
      }
    }

    // ---- TASK UPDATED EVENT ----
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: updatedTask.task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.TASK_UPDATED,
      message: "Task updated",
      before_json: oldTask ?? undefined,
      after_json: updatedTask,
    });

    res.json({ success: true, data: updatedTask });
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
      message: `Logged progress`,
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
