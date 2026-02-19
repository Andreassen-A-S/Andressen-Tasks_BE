import type { Request, Response } from "express";
import { TaskEventType } from "../generated/prisma/client";
import * as taskEventRepo from "../repositories/taskEventRepository";
import * as taskRepo from "../repositories/taskRepository";
import {
  AssignmentNotFoundError,
  TaskAlreadyDoneError,
  TaskNotFoundError,
  TaskNotProgressableError,
} from "../repositories/taskRepository";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";
import { getParamId, requireUserId } from "../helper/helpers";

/**
 * These routes are protected by auth middleware.
 * Kept as a safety net for robust controller behavior.
 */

function actorConnect(userId: string) {
  return { connect: { user_id: userId } } as const;
}

function taskConnect(taskId: string) {
  return { connect: { task_id: taskId } } as const;
}

function emptyObj() {
  return {} as Record<string, never>;
}

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
  if (error instanceof TaskAlreadyDoneError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error instanceof TaskNotProgressableError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error instanceof AssignmentNotFoundError) {
    return res.status(404).json({ success: false, error: error.message });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, error: fallbackMessage });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function listTasks(_req: Request, res: Response) {
  try {
    const tasks = await taskRepo.getAllTasks();
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
    const task = await taskRepo.getTaskById(id);
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
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const body = req.body as CreateTaskInput;

    if (body.created_by && body.created_by !== userId) {
      return res.status(400).json({
        success: false,
        error: "created_by must match the authenticated user",
      });
    }

    const input: CreateTaskInput = { ...body, created_by: userId };
    const task = await taskRepo.createTaskWithAssignments(input);

    if (!task) {
      return res
        .status(500)
        .json({ success: false, error: "Failed to create task" });
    }

    await taskEventRepo.createTaskEvent({
      task: taskConnect(task.task_id),
      actor: actorConnect(userId),
      type: TaskEventType.TASK_CREATED,
      message: "Task created",
      before_json: emptyObj(),
      after_json: task,
    });

    if (task.assignments && task.assignments.length > 0) {
      await Promise.all(
        task.assignments.map((assignment) =>
          taskEventRepo.createTaskEvent({
            task: taskConnect(task.task_id),
            actor: actorConnect(userId),
            type: TaskEventType.ASSIGNMENT_CREATED,
            message: "Created assignment",
            assignment: {
              connect: { assignment_id: assignment.assignment_id },
            },
            before_json: undefined,
            after_json: assignment,
          }),
        ),
      );
    }

    return res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error("Error in createTask:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to create task" });
  }
}

export async function updateTask(req: Request, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const id = getParamId(req);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid id" });
  }

  try {
    const updateData = req.body as UpdateTaskInput;
    const actor = actorConnect(userId);

    // No assignment changes requested — use the lighter updateTask path.
    if (updateData.assigned_users === undefined) {
      const oldTask = await taskRepo.getTaskById(id);
      if (!oldTask) {
        return res
          .status(404)
          .json({ success: false, error: "Task not found" });
      }

      const updatedTask = await taskRepo.updateTask(id, updateData, userId);

      await taskEventRepo.createTaskEvent({
        task: taskConnect(updatedTask.task_id),
        actor,
        type: TaskEventType.TASK_UPDATED,
        message: "Task updated",
        before_json: oldTask,
        after_json: updatedTask,
      });

      if (updateData.status && oldTask.status !== updatedTask.status) {
        await taskEventRepo.createTaskEvent({
          task: taskConnect(updatedTask.task_id),
          actor,
          type: TaskEventType.TASK_STATUS_CHANGED,
          message: `Status changed from ${oldTask.status} to ${updatedTask.status}`,
          before_json: { status: oldTask.status },
          after_json: { status: updatedTask.status },
        });
      }

      return res.json({ success: true, data: updatedTask });
    }

    // Assignment changes requested — use the full updateTaskWithAssignments path.
    const oldTask = await taskRepo.getTaskByIdWithAssignments(id);
    if (!oldTask) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const updatedTask = await taskRepo.updateTaskWithAssignments(
      id,
      updateData,
      userId,
    );

    if (!updatedTask) {
      return res
        .status(404)
        .json({ success: false, error: "Task not found or update failed" });
    }

    // Diff assignments and emit events.
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

    await Promise.all([
      ...added.map((assignment) =>
        taskEventRepo.createTaskEvent({
          task: taskConnect(updatedTask.task_id),
          actor,
          type: TaskEventType.ASSIGNMENT_CREATED,
          message: "Created assignment",
          assignment: {
            connect: { assignment_id: assignment.assignment_id },
          },
          before_json: undefined,
          after_json: assignment,
        }),
      ),
      ...removed.map((assignment) =>
        taskEventRepo.createTaskEvent({
          task: taskConnect(updatedTask.task_id),
          actor,
          type: TaskEventType.ASSIGNMENT_DELETED,
          message: "Deleted assignment",
          before_json: assignment,
          after_json: emptyObj(),
        }),
      ),
    ]);

    await taskEventRepo.createTaskEvent({
      task: taskConnect(updatedTask.task_id),
      actor,
      type: TaskEventType.TASK_UPDATED,
      message: "Task updated",
      before_json: oldTask,
      after_json: updatedTask,
    });

    if (updateData.status && oldTask.status !== updatedTask.status) {
      await taskEventRepo.createTaskEvent({
        task: taskConnect(updatedTask.task_id),
        actor,
        type: TaskEventType.TASK_STATUS_CHANGED,
        message: `Status changed from ${oldTask.status} to ${updatedTask.status}`,
        before_json: { status: oldTask.status },
        after_json: { status: updatedTask.status },
      });
    }

    return res.json({ success: true, data: updatedTask });
  } catch (error) {
    return handleDomainError(error, res, "Failed to update task");
  }
}

export async function deleteTask(req: Request, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const id = getParamId(req);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "Missing or invalid id" });
  }

  try {
    const task = await taskRepo.getTaskById(id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    await taskEventRepo.createTaskEvent({
      task: taskConnect(task.task_id),
      actor: actorConnect(userId),
      type: TaskEventType.TASK_DELETED,
      message: "Task deleted",
      before_json: task,
      after_json: emptyObj(),
    });

    await taskRepo.deleteTask(id);
    return res.status(204).send();
  } catch (error) {
    console.error("Error in deleteTask:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to delete task" });
  }
}

export async function upsertProgressLog(req: Request, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

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
    const { progressLog, updatedTask } = await taskRepo.upsertProgressLog(
      taskId,
      userId,
      quantity_done,
      unit,
      note,
    );

    await taskEventRepo.createTaskEvent({
      task: taskConnect(taskId),
      actor: actorConnect(userId),
      type: TaskEventType.PROGRESS_LOGGED,
      message: `Logged progress: ${quantity_done} ${unit || "units"}`,
      progress: { connect: { progress_id: progressLog.progress_id } },
      before_json: emptyObj(),
      after_json: progressLog,
    });

    return res.json({
      success: true,
      data: {
        progressLog,
        task: {
          current_quantity: updatedTask.current_quantity,
          status: updatedTask.status,
        },
      },
    });
  } catch (error) {
    return handleDomainError(error, res, "Failed to upsert progress log");
  }
}
