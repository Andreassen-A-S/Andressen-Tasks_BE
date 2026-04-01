import { prisma } from "../db/prisma";
import {
  type Task,
  TaskGoalType,
  TaskStatus,
  TaskUnit,
  UserRole,
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

export async function getAllTasks() {
  const tasks = await prisma.task.findMany({
    orderBy: { created_at: "desc" },
    include: { assignments: { select: { user_id: true } } },
  });
  return tasks.map(({ assignments, ...task }) => ({
    ...task,
    assigned_users: assignments.map((a) => a.user_id),
  }));
}

export async function getTaskById(id: string) {
  return prisma.task.findUnique({
    where: { task_id: id },
    include: { project: { select: { name: true, color: true } } },
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
        creator: { connect: { user_id: data.created_by } },
        project: { connect: { project_id: data.project_id } },
        ...(data.parent_task_id
          ? { parent: { connect: { task_id: data.parent_task_id } } }
          : {}),
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

    const isAlreadyDone = existingTask.status === TaskStatus.DONE;
    if (data.status === TaskStatus.DONE && isAlreadyDone) {
      throw new TaskAlreadyDoneError();
    }

    const { assigned_users, ...taskUpdateData } = data;
    const finalStatus = data.status ?? existingTask.status;

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

    const isAlreadyDone = existingTask.status === TaskStatus.DONE;
    if (data.status === TaskStatus.DONE && isAlreadyDone) {
      throw new TaskAlreadyDoneError();
    }

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
// Scheduler queries
// ---------------------------------------------------------------------------

const CPH_TZ = "Europe/Copenhagen";

/**
 * Returns the UTC offset (in ms) for a given timezone at a specific UTC instant.
 * Positive for UTC+ zones (e.g. CET = +3_600_000).
 */
function getUTCOffsetMs(utcDate: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcDate);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  let ms =
    ((get("hour") % 24 - utcDate.getUTCHours()) * 60 +
      (get("minute") - utcDate.getUTCMinutes())) *
      60_000 +
    (get("second") - utcDate.getUTCSeconds()) * 1_000;
  if (ms > 12 * 3_600_000) ms -= 24 * 3_600_000;
  if (ms < -12 * 3_600_000) ms += 24 * 3_600_000;
  return ms;
}

/**
 * Returns half-open [start, end) UTC bounds for the calendar day that `date`
 * falls on in Europe/Copenhagen, correctly handling CET/CEST transitions.
 *
 * Exported for unit testing.
 */
export function copenhagenDayBounds(date: Date): { start: Date; end: Date } {
  // Read the calendar date (YYYY-MM-DD) as seen in Copenhagen.
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CPH_TZ })
    .format(date)
    .split("-")
    .map(Number) as [number, number, number];

  const [year, month, day] = parts;

  // Probe midnight UTC for this date and the next to get the correct offset
  // at each boundary — necessary for DST transition days where the offset
  // changes between midnight and the next midnight.
  const midnightUTC = new Date(Date.UTC(year, month - 1, day));
  const nextMidnightUTC = new Date(Date.UTC(year, month - 1, day + 1));

  const start = new Date(
    midnightUTC.getTime() - getUTCOffsetMs(midnightUTC, CPH_TZ),
  );
  const end = new Date(
    nextMidnightUTC.getTime() - getUTCOffsetMs(nextMidnightUTC, CPH_TZ),
  );
  return { start, end };
}

export async function getTodayTasksPerUser(
  date: Date,
): Promise<{ user_id: string; push_token: string; tasks: Task[] }[]> {
  const { start, end } = copenhagenDayBounds(date);

  const assignments = await prisma.taskAssignment.findMany({
    where: {
      task: {
        scheduled_date: { lt: end },
        status: { notIn: [TaskStatus.DONE, TaskStatus.REJECTED, TaskStatus.ARCHIVED] },
      },
      user: { push_token: { not: null } },
    },
    include: {
      task: true,
      user: { select: { user_id: true, push_token: true } },
    },
  });

  const byUser = new Map<string, { push_token: string; tasks: Task[] }>();
  for (const a of assignments) {
    const entry = byUser.get(a.user_id);
    if (entry) {
      entry.tasks.push(a.task);
    } else {
      byUser.set(a.user_id, { push_token: a.user.push_token!, tasks: [a.task] });
    }
  }

  return Array.from(byUser.entries()).map(([user_id, { push_token, tasks }]) => ({
    user_id,
    push_token,
    tasks,
  }));
}

export async function getUsersWithNoActivityToday(
  date: Date,
): Promise<{ user_id: string; push_token: string }[]> {
  const { start, end } = copenhagenDayBounds(date);

  const activeAssignments = await prisma.taskAssignment.findMany({
    where: {
      task: {
        status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
        scheduled_date: { gte: start, lt: end },
      },
      user: { push_token: { not: null } },
    },
    select: {
      user_id: true,
      user: { select: { push_token: true } },
      progressLogs: {
        where: { created_at: { gte: start, lt: end } },
        select: { progress_id: true },
        take: 1,
      },
    },
  });

  // Per user: track whether they have ANY activity today across all assignments
  const userMap = new Map<string, { push_token: string; hasActivity: boolean }>();
  for (const a of activeAssignments) {
    const hasActivity = a.progressLogs.length > 0;
    const existing = userMap.get(a.user_id);
    if (!existing) {
      userMap.set(a.user_id, { push_token: a.user.push_token!, hasActivity });
    } else if (hasActivity) {
      existing.hasActivity = true;
    }
  }

  const result: { user_id: string; push_token: string }[] = [];
  for (const [user_id, { push_token, hasActivity }] of userMap.entries()) {
    if (!hasActivity) result.push({ user_id, push_token });
  }
  return result;
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
    const user = await tx.user.findUnique({ where: { user_id: userId }, select: { role: true } });

    const isAdmin = user?.role === UserRole.ADMIN;
    if (!assignment && !isAdmin) throw new AssignmentNotFoundError();

    const resolvedAssignment = assignment ?? await tx.taskAssignment.upsert({
      where: { task_id_user_id: { task_id: taskId, user_id: userId } },
      create: { task_id: taskId, user_id: userId },
      update: {},
    });

    const progressLog = await tx.taskProgressLog.create({
      data: {
        assignment_id: resolvedAssignment.assignment_id,
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
