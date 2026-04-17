import { prisma } from "../db/prisma";
import {
  type Task,
  type Prisma,
  TaskGoalType,
  TaskStatus,
  TaskUnit,
  UserRole,
} from "../generated/prisma/client";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";
import { appDayBounds } from "../utils/dateUtils";

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
  const task = await prisma.task.findUnique({
    where: { task_id: id },
    include: {
      project: { select: { name: true, color: true } },
      assignments: { select: { user_id: true } },
    },
  });
  if (!task) return null;
  const { assignments, ...rest } = task;
  return { ...rest, assigned_users: assignments.map((a) => a.user_id) };
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
        start_date: data.start_date,
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

export async function updateTask(
  id: string,
  data: UpdateTaskInput,
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const existingTask = await tx.task.findUnique({
      where: { task_id: id },
      select: { status: true },
    });
    if (!existingTask) throw new TaskNotFoundError(id);

    if (data.status === TaskStatus.DONE && existingTask.status === TaskStatus.DONE) {
      throw new TaskAlreadyDoneError();
    }

    const { assigned_users, ...taskUpdateData } = data;
    const finalStatus = data.status ?? existingTask.status;
    const completionTimestamp = new Date();

    const preserveCompletion =
      data.status === TaskStatus.ARCHIVED && existingTask.status === TaskStatus.DONE;

    const updateData: Prisma.TaskUpdateInput = {
      ...taskUpdateData,
      ...(data.status === TaskStatus.DONE
        ? userId ? { completed_by: userId, completed_at: completionTimestamp } : {}
        : data.status !== undefined && !preserveCompletion
          ? { completed_by: null, completed_at: null }
          : {}),
    };

    await tx.task.update({ where: { task_id: id }, data: updateData });

    if (assigned_users !== undefined) {
      if (finalStatus === TaskStatus.DONE || preserveCompletion) {
        // Preserve existing completion timestamps; stamp new assignees for DONE transitions.
        const existingAssignments = await tx.taskAssignment.findMany({
          where: { task_id: id },
          select: { user_id: true, completed_at: true },
        });
        const existingMap = new Map(existingAssignments.map((a) => [a.user_id, a.completed_at]));
        await tx.taskAssignment.deleteMany({ where: { task_id: id } });
        if (assigned_users.length > 0) {
          await tx.taskAssignment.createMany({
            data: assigned_users.map((assigneeId) => ({
              task_id: id,
              user_id: assigneeId,
              completed_at: existingMap.get(assigneeId) ?? (finalStatus === TaskStatus.DONE ? completionTimestamp : null),
            })),
          });
        }
      } else {
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
      await tx.taskAssignment.updateMany({
        where: { task_id: id },
        data: { completed_at: completionTimestamp },
      });
    } else if (data.status !== undefined && !preserveCompletion) {
      await tx.taskAssignment.updateMany({
        where: { task_id: id },
        data: { completed_at: null },
      });
    }

    return tx.task.findUnique({
      where: { task_id: id },
      include: {
        assignments: { select: { assignment_id: true, user_id: true } },
        project: { select: { name: true, color: true } },
      },
    });
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

export async function getTodayTasksPerUser(
  date: Date,
): Promise<{ user_id: string; push_token: string; tasks: Task[] }[]> {
  const { end } = appDayBounds(date);

  const assignments = await prisma.taskAssignment.findMany({
    where: {
      task: {
        start_date: { lt: end },
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
  const { start, end } = appDayBounds(date);

  const activeAssignments = await prisma.taskAssignment.findMany({
    where: {
      task: {
        status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
        start_date: { gte: start, lt: end },
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

export async function getStaleDoneTasks(olderThanDays: number) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  return prisma.task.findMany({
    where: {
      status: TaskStatus.DONE,
      completed_at: { lt: cutoff },
    },
    include: {
      assignments: { select: { assignment_id: true, user_id: true } },
      project: { select: { name: true, color: true } },
    },
  });
}
