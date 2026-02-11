import type { Request, Response } from "express";
import { TaskEventType } from "../generated/prisma/client";
import * as taskEventRepo from "../repositories/taskEventRepository";
import * as taskRepo from "../repositories/taskRepository";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";

/**
 * These routes are protected by auth middleware.
 * Kept as a safety net for robust controller behavior.
 */

function getParamId(req: Request, key: string = "id"): string | null {
  const raw = req.params[key];
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  return raw;
}

function requireUserId(req: Request, res: Response): string | null {
  const userId = req.user?.user_id;
  if (!userId) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return null;
  }
  return userId;
}

function actorConnect(userId: string) {
  return { connect: { user_id: userId } } as const;
}

function taskConnect(taskId: string) {
  return { connect: { task_id: taskId } } as const;
}

function emptyObj() {
  return {} as Record<string, never>;
}

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

    // Reject if client sends a mismatching created_by
    if (body.created_by && body.created_by !== userId) {
      return res.status(400).json({
        success: false,
        error: "created_by must match the authenticated user",
      });
    }

    // Always set created_by to the authenticated user
    const input: CreateTaskInput = {
      ...body,
      created_by: userId,
    };

    const task = await taskRepo.createTaskWithAssignments(input);
    if (!task)
      return res
        .status(500)
        .json({ success: false, error: "Failed to create task" });

    // TaskEvent logic
    await taskEventRepo.createTaskEvent({
      task: taskConnect(task.task_id),
      actor: actorConnect(userId),
      type: TaskEventType.TASK_CREATED,
      message: "Task created",
      before_json: emptyObj(),
      after_json: task,
    });

    // Log individual events for each assignment
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
            after_json: {
              assignment_id: assignment.assignment_id,
              task_id: task.task_id,
              user_id: assignment.user_id,
            },
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

    // no assignment changes requested
    if (updateData.assigned_users === undefined) {
      const oldTask = await taskRepo.getTaskById(id);
      if (!oldTask)
        return res
          .status(404)
          .json({ success: false, error: "Task not found" });

      const updatedTask = await taskRepo.updateTask(id, updateData);
      if (!updatedTask)
        return res
          .status(404)
          .json({ success: false, error: "Task not found or update failed" });

      await taskEventRepo.createTaskEvent({
        task: taskConnect(updatedTask.task_id),
        actor,
        type: TaskEventType.TASK_UPDATED,
        message: "Task updated",
        before_json: oldTask,
        after_json: updatedTask,
      });

      return res.json({ success: true, data: updatedTask });
    }

    // assignment changes requested
    const oldTask = await taskRepo.getTaskByIdWithAssignments(id);
    if (!oldTask)
      return res.status(404).json({ success: false, error: "Task not found" });

    const updatedTask = await taskRepo.updateTaskWithAssignments(
      id,
      updateData,
    );
    if (!updatedTask)
      return res
        .status(404)
        .json({ success: false, error: "Task not found or update failed" });

    // Diff assignments
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

    // Log assignment events
    await Promise.all([
      ...added.map((assignment) =>
        taskEventRepo.createTaskEvent({
          task: taskConnect(updatedTask.task_id),
          actor,
          type: TaskEventType.ASSIGNMENT_CREATED,
          message: "Created assignment",
          assignment: { connect: { assignment_id: assignment.assignment_id } },
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

    // Log task updated event
    await taskEventRepo.createTaskEvent({
      task: taskConnect(updatedTask.task_id),
      actor,
      type: TaskEventType.TASK_UPDATED,
      message: "Task updated",
      before_json: oldTask,
      after_json: updatedTask,
    });

    return res.json({ success: true, data: updatedTask });
  } catch (error) {
    console.error("Error in updateTask:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to update task" });
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
    // TaskEvent logic
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

  const { quantity_done, note } = req.body;

  try {
    const progressLog = await taskRepo.upsertProgressLog(
      taskId,
      userId,
      quantity_done,
      note,
    );

    // Add TaskEvent logic
    await taskEventRepo.createTaskEvent({
      task: taskConnect(taskId),
      actor: actorConnect(userId),
      type: TaskEventType.PROGRESS_LOGGED,
      message: "Logged progress",
      progress: { connect: { progress_id: progressLog.progress_id } },
      before_json: emptyObj(),
      after_json: progressLog,
    });

    return res.json({ success: true, data: progressLog });
  } catch (error) {
    console.error("Error in upsertProgressLog:", error);
    if (error instanceof Error && error.message === "Assignment not found") {
      return res
        .status(404)
        .json({ success: false, error: "Assignment not found" });
    }
    return res
      .status(500)
      .json({ success: false, error: "Failed to upsert progress log" });
  }
}
