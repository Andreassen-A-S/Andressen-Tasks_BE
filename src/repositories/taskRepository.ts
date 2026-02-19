import { prisma } from "../db/prisma";
import {
  type Task,
  TaskGoalType,
  TaskStatus,
  TaskUnit,
} from "../generated/prisma/client";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";

// ---------------------------------------------------------------------------
// Domain errors — catch these in controllers and map to appropriate HTTP codes
// ---------------------------------------------------------------------------

export class TaskNotFoundError extends Error {
  constructor(id: string) {
    super(`Task not found: ${id}`);
    this.name = "TaskNotFoundError";
  }
}

export class TaskAlreadyDoneError extends Error {
  constructor() {
    super("Task is already marked as done and cannot be set to done again.");
    this.name = "TaskAlreadyDoneError";
  }
}

export class AssignmentNotFoundError extends Error {
  constructor() {
    super("Assignment not found for this task and user.");
    this.name = "AssignmentNotFoundError";
  }
}

export class TaskNotProgressableError extends Error {
  constructor(status: TaskStatus) {
    super(`Cannot log progress on tasks with status: ${status}`);
    this.name = "TaskNotProgressableError";
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAllTasks(): Promise<Task[]> {
  return prisma.task.findMany({
    orderBy: { created_at: "desc" },
  });
}

export async function getTaskById(id: string): Promise<Task | null> {
  return prisma.task.findUnique({
    where: { task_id: id },
  });
}

export async function getTaskByIdWithAssignments(id: string) {
  return prisma.task.findUnique({
    where: { task_id: id },
    include: {
      assignments: {
        include: {
          user: {
            select: { user_id: true, name: true, email: true, position: true },
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Creates
// ---------------------------------------------------------------------------

export async function createTask(data: CreateTaskInput) {
  return prisma.task.create({ data });
}

export async function createTaskWithAssignments(data: CreateTaskInput) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.status,
        deadline: data.deadline,
        created_by: data.created_by,
        parent_task_id: data.parent_task_id ?? null,
        scheduled_date: data.scheduled_date,
        unit: data.unit ?? TaskUnit.NONE,
        goal_type: data.goal_type ?? TaskGoalType.OPEN,
        target_quantity: data.target_quantity ?? null,
        current_quantity: data.current_quantity ?? 0,
      },
    });

    if (data.assigned_users && data.assigned_users.length > 0) {
      await tx.taskAssignment.createMany({
        data: data.assigned_users.map((userId) => ({
          task_id: task.task_id,
          user_id: userId,
        })),
      });
    }

    return tx.task.findUnique({
      where: { task_id: task.task_id },
      include: {
        assignments: {
          include: {
            user: {
              select: {
                user_id: true,
                name: true,
                email: true,
                position: true,
              },
            },
          },
        },
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export async function updateTaskWithAssignments(
  id: string,
  data: UpdateTaskInput,
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const existingTask = await tx.task.findUnique({
      where: { task_id: id },
      select: {
        status: true,
        completed_by: true,
        completed_at: true,
      },
    });
    if (!existingTask) throw new TaskNotFoundError(id);

    // Fix 1: Block DONE -> DONE explicitly.
    const isAlreadyDone = existingTask.status === TaskStatus.DONE;
    if (data.status === TaskStatus.DONE && isAlreadyDone) {
      throw new TaskAlreadyDoneError();
    }

    const { assigned_users, ...taskUpdateData } = data;
    const finalStatus = data.status ?? existingTask.status;

    // Fix 2: completionTimestamp is always "now" — never reuse historical timestamps.
    const completionTimestamp = new Date();

    const updateData: Record<string, unknown> = { ...taskUpdateData };

    if (data.status === undefined) {
      // No status change — leave completion fields untouched.
    } else if (data.status === TaskStatus.DONE) {
      // isAlreadyDone branch is already thrown above, so this is always a
      // fresh transition to DONE.
      if (userId) {
        updateData.completed_by = userId;
        updateData.completed_at = completionTimestamp;
      }
    } else {
      // Transitioning away from DONE or to any other status.
      updateData.completed_by = null;
      updateData.completed_at = null;
    }

    await tx.task.update({
      where: { task_id: id },
      data: updateData,
    });

    // Fix 4: Assignment replacement rules are status-aware and preserve
    // existing per-assignment completed_at when the task is/was DONE.
    if (assigned_users !== undefined) {
      if (finalStatus === TaskStatus.DONE) {
        // Preserve existing completion timestamps for assignments that already
        // have one; stamp new ones with the current completionTimestamp.
        const existingAssignments = await tx.taskAssignment.findMany({
          where: { task_id: id },
          select: { user_id: true, completed_at: true },
        });
        const existingMap = new Map(
          existingAssignments.map((a) => [a.user_id, a.completed_at]),
        );

        await tx.taskAssignment.deleteMany({ where: { task_id: id } });

        if (assigned_users.length > 0) {
          await tx.taskAssignment.createMany({
            data: assigned_users.map((assigneeId) => ({
              task_id: id,
              user_id: assigneeId,
              // Preserve historical timestamp if this assignee already had one;
              // otherwise stamp now (they're being added to a done task).
              completed_at: existingMap.get(assigneeId) ?? completionTimestamp,
            })),
          });
        }
      } else {
        // Task is not done — recreate assignments with no completion timestamps.
        await tx.taskAssignment.deleteMany({ where: { task_id: id } });

        if (assigned_users.length > 0) {
          await tx.taskAssignment.createMany({
            data: assigned_users.map((assigneeId) => ({
              task_id: id,
              user_id: assigneeId,
              completed_at: null,
            })),
          });
        }
      }
    } else if (data.status === TaskStatus.DONE) {
      // No assignment replacement — stamp all existing assignments now.
      await tx.taskAssignment.updateMany({
        where: { task_id: id },
        data: { completed_at: completionTimestamp },
      });
    } else if (data.status !== undefined) {
      // Status changed to something other than DONE — clear all timestamps.
      await tx.taskAssignment.updateMany({
        where: { task_id: id },
        data: { completed_at: null },
      });
    }

    return tx.task.findUnique({
      where: { task_id: id },
      include: {
        assignments: {
          include: {
            user: {
              select: {
                user_id: true,
                name: true,
                email: true,
                position: true,
              },
            },
          },
        },
        creator: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  });
}

export async function updateTask(
  id: string,
  data: UpdateTaskInput,
  userId?: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    const existingTask = await tx.task.findUnique({
      where: { task_id: id },
      select: {
        status: true,
        completed_by: true,
        completed_at: true,
      },
    });
    if (!existingTask) throw new TaskNotFoundError(id);

    // Fix 1: Block DONE -> DONE explicitly.
    const isAlreadyDone = existingTask.status === TaskStatus.DONE;
    if (data.status === TaskStatus.DONE && isAlreadyDone) {
      throw new TaskAlreadyDoneError();
    }

    // Fix 2: Always use a fresh timestamp — never reuse historical ones.
    const completionTimestamp = new Date();

    const task = await tx.task.update({
      where: { task_id: id },
      data: {
        ...data,
        ...(data.status === undefined
          ? {}
          : data.status === TaskStatus.DONE
            ? userId
              ? { completed_by: userId, completed_at: completionTimestamp }
              : {}
            : { completed_by: null, completed_at: null }),
      },
    });

    if (data.status === TaskStatus.DONE) {
      // Fresh transition to DONE — stamp all assignments now.
      await tx.taskAssignment.updateMany({
        where: { task_id: id },
        data: { completed_at: completionTimestamp },
      });
    } else if (data.status !== undefined) {
      await tx.taskAssignment.updateMany({
        where: { task_id: id },
        data: { completed_at: null },
      });
    }

    return task;
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteTask(id: string): Promise<void> {
  await prisma.task.delete({
    where: { task_id: id },
  });
}

// ---------------------------------------------------------------------------
// Progress logging
// ---------------------------------------------------------------------------

export async function upsertProgressLog(
  taskId: string,
  userId: string,
  quantity_done: number,
  unit?: TaskUnit,
  note?: string,
) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { task_id: taskId } });
    if (!task) throw new TaskNotFoundError(taskId);

    const nonProgressableStatuses: TaskStatus[] = [
      TaskStatus.ARCHIVED,
      TaskStatus.REJECTED,
      TaskStatus.DONE,
    ];
    if (nonProgressableStatuses.includes(task.status)) {
      throw new TaskNotProgressableError(task.status);
    }

    const assignment = await tx.taskAssignment.findUnique({
      where: { task_id_user_id: { task_id: taskId, user_id: userId } },
    });
    if (!assignment) throw new AssignmentNotFoundError();

    const progressLog = await tx.taskProgressLog.create({
      data: {
        assignment_id: assignment.assignment_id,
        quantity_done,
        unit,
        note,
      },
    });

    const newCurrentQuantity = (task.current_quantity || 0) + quantity_done;
    let newStatus: TaskStatus = task.status;

    if (quantity_done > 0 && task.status === TaskStatus.PENDING) {
      newStatus = TaskStatus.IN_PROGRESS;
    }

    if (
      task.goal_type === TaskGoalType.FIXED &&
      task.target_quantity &&
      newCurrentQuantity >= task.target_quantity
    ) {
      newStatus = TaskStatus.DONE;
    }

    const completionTimestamp = new Date();

    const updatedTask = await tx.task.update({
      where: { task_id: taskId },
      data: {
        current_quantity: newCurrentQuantity,
        status: newStatus,
        updated_at: new Date(),
        ...(newStatus === TaskStatus.DONE
          ? { completed_by: userId, completed_at: completionTimestamp }
          : {}),
      },
    });

    if (newStatus === TaskStatus.DONE) {
      await tx.taskAssignment.updateMany({
        where: { task_id: taskId },
        data: { completed_at: completionTimestamp },
      });
    }

    return { progressLog, updatedTask };
  });
}
