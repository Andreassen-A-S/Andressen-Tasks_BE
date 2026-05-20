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
import type { DbClient } from "../types/db";
import { userSelect } from "../types/user";
import { appDayBounds } from "../utils/dateUtils";
import {
  TaskNotFoundError,
  TaskAlreadyDoneError,
  TaskArchivedError,
  AssignmentNotFoundError,
  TaskNotProgressableError,
  CrossOrganizationReferenceError,
} from "../errors/domainErrors";

// Re-export domain errors for backward compatibility with existing test imports.
export {
  TaskNotFoundError,
  TaskAlreadyDoneError,
  TaskArchivedError,
  AssignmentNotFoundError,
  TaskNotProgressableError,
  CrossOrganizationReferenceError,
} from "../errors/domainErrors";

async function resolveProjectOrgId(
  client: DbClient,
  projectId: string,
  effectiveOrgId: string | null,
): Promise<string> {
  const project = await (client as any).project.findFirst({
    where: {
      project_id: projectId,
      ...(effectiveOrgId ? { organization_id: effectiveOrgId } : {}),
    },
    select: { organization_id: true },
  });
  if (!project) throw new CrossOrganizationReferenceError("Project not found in organization.");
  return project.organization_id;
}

async function assertUsersInOrg(
  client: DbClient,
  userIds: string[] | undefined,
  organizationId: string,
): Promise<void> {
  if (!userIds || userIds.length === 0) return;
  const uniqueUserIds = Array.from(new Set(userIds));
  const users = await (client as any).user.findMany({
    where: {
      user_id: { in: uniqueUserIds },
      organization_id: organizationId,
      role: { not: UserRole.SYSTEM },
    },
    select: { user_id: true },
  });
  if (users.length !== uniqueUserIds.length) {
    throw new CrossOrganizationReferenceError("Assigned users must belong to the task organization.");
  }
}

// ---------------------------------------------------------------------------
// Reads — use prisma directly; they never participate in cross-repo transactions
// ---------------------------------------------------------------------------

export async function getAllTasks(orgId: string | null) {
  const tasks = await prisma.task.findMany({
    where: orgId ? { project: { organization_id: orgId } } : undefined,
    orderBy: { created_at: "desc" },
    include: { assignments: { select: { user_id: true } } },
  });
  return tasks.map(({ assignments, ...task }) => ({
    ...task,
    assigned_users: assignments.map((a) => a.user_id),
  }));
}

export async function getTaskById(id: string, orgId: string | null) {
  const task = await prisma.task.findFirst({
    where: {
      task_id: id,
      ...(orgId ? { project: { organization_id: orgId } } : {}),
    },
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

// Services own the transaction; db is the tx client passed from the service.
export async function createTaskWithAssignments(
  db: DbClient,
  data: CreateTaskInput,
  effectiveOrgId: string | null,
) {
  const projectOrgId = await resolveProjectOrgId(db, data.project_id, effectiveOrgId);
  await assertUsersInOrg(db, data.assigned_users, projectOrgId);

  if (data.parent_task_id) {
    const parent = await (db as any).task.findFirst({
      where: {
        task_id: data.parent_task_id,
        project: { organization_id: projectOrgId },
      },
      select: { task_id: true },
    });
    if (!parent) throw new CrossOrganizationReferenceError("Parent task not found in organization.");
  }

  const task = await (db as any).task.create({
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
    await (db as any).taskAssignment.createMany({
      data: data.assigned_users.map((userId: string) => ({
        task_id: task.task_id,
        user_id: userId,
      })),
    });
  }

  return (db as any).task.findUnique({
    where: { task_id: task.task_id },
    include: {
      assignments: {
        include: {
          user: { select: userSelect },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Updates — db is the transaction client passed from the service
// ---------------------------------------------------------------------------

// Internal scoped update; no transaction wrapper — the service provides the tx.
async function updateTaskScoped(
  db: DbClient,
  id: string,
  data: UpdateTaskInput,
  userId?: string,
  effectiveOrgId?: string,
) {
  const existingTask = await (db as any).task.findFirst({
    where: {
      task_id: id,
      ...(effectiveOrgId ? { project: { organization_id: effectiveOrgId } } : {}),
    },
    select: { status: true, project_id: true, project: { select: { organization_id: true } } },
  });
  if (!existingTask) throw new TaskNotFoundError(id);

  // Archived tasks are read-only; mutations are rejected to preserve audit integrity.
  if (existingTask.status === TaskStatus.ARCHIVED) {
    throw new TaskArchivedError();
  }

  // A task already marked done cannot be set to done again without transitioning first.
  if (data.status === TaskStatus.DONE && existingTask.status === TaskStatus.DONE) {
    throw new TaskAlreadyDoneError();
  }

  const { assigned_users, ...taskUpdateData } = data;
  const targetProjectOrgId = data.project_id
    ? await resolveProjectOrgId(db, data.project_id, effectiveOrgId ?? null)
    : existingTask.project.organization_id;

  if (targetProjectOrgId !== existingTask.project.organization_id) {
    throw new CrossOrganizationReferenceError("Task cannot be moved to a project in another organization.");
  }

  await assertUsersInOrg(db, assigned_users, targetProjectOrgId);

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

  await (db as any).task.update({ where: { task_id: id }, data: updateData });

  if (assigned_users !== undefined) {
    if (finalStatus === TaskStatus.DONE || preserveCompletion) {
      // Preserve existing completion timestamps for DONE and DONE→ARCHIVED transitions.
      // New assignees added during DONE→ARCHIVED get null (they weren't assigned at completion time).
      const existingAssignments = await (db as any).taskAssignment.findMany({
        where: { task_id: id },
        select: { user_id: true, completed_at: true },
      });
      const existingMap = new Map(existingAssignments.map((a: any) => [a.user_id, a.completed_at]));
      await (db as any).taskAssignment.deleteMany({ where: { task_id: id } });
      if (assigned_users.length > 0) {
        await (db as any).taskAssignment.createMany({
          data: assigned_users.map((assigneeId: string) => ({
            task_id: id,
            user_id: assigneeId,
            completed_at: existingMap.get(assigneeId) ?? (finalStatus === TaskStatus.DONE ? completionTimestamp : null),
          })),
        });
      }
    } else {
      await (db as any).taskAssignment.deleteMany({ where: { task_id: id } });
      if (assigned_users.length > 0) {
        await (db as any).taskAssignment.createMany({
          data: assigned_users.map((assigneeId: string) => ({
            task_id: id,
            user_id: assigneeId,
            completed_at: null,
          })),
        });
      }
    }
  } else if (data.status === TaskStatus.DONE) {
    await (db as any).taskAssignment.updateMany({
      where: { task_id: id },
      data: { completed_at: completionTimestamp },
    });
  } else if (data.status !== undefined && !preserveCompletion) {
    await (db as any).taskAssignment.updateMany({
      where: { task_id: id },
      data: { completed_at: null },
    });
  }

  return (db as any).task.findUnique({
    where: { task_id: id },
    include: {
      assignments: {
        include: {
          user: { select: userSelect },
        },
      },
      project: { select: { name: true, color: true } },
    },
  });
}

// Org-scoped update. db is the tx client passed from the service.
export async function updateTaskInOrg(
  db: DbClient,
  id: string,
  orgId: string,
  data: UpdateTaskInput,
  userId?: string,
) {
  return updateTaskScoped(db, id, data, userId, orgId);
}

// Platform-level update (super-admin). db is the tx client passed from the service.
export async function updateTaskPlatform(
  db: DbClient,
  id: string,
  data: UpdateTaskInput,
  userId?: string,
) {
  return updateTaskScoped(db, id, data, userId);
}

// ---------------------------------------------------------------------------
// Delete — db is the transaction client passed from the service
// ---------------------------------------------------------------------------

// Org-scoped delete; rejects with TaskNotFoundError if task is outside the org.
export async function deleteTaskInOrg(db: DbClient, id: string, orgId: string): Promise<void> {
  const result = await (db as any).task.deleteMany({
    where: { task_id: id, project: { organization_id: orgId } },
  });
  if (result.count === 0) throw new TaskNotFoundError(id);
}

// Platform-level delete (super-admin).
export async function deleteTaskPlatform(db: DbClient, id: string): Promise<void> {
  const result = await (db as any).task.deleteMany({
    where: { task_id: id },
  });
  if (result.count === 0) throw new TaskNotFoundError(id);
}

// ---------------------------------------------------------------------------
// Scheduler queries — use prisma directly; standalone reads
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
// Progress logging — db is the transaction client passed from the service
// ---------------------------------------------------------------------------

// Internal scoped progress log upsert; no transaction wrapper — the service provides the tx.
async function upsertProgressLogScoped(
  db: DbClient,
  taskId: string,
  userId: string,
  quantity_done: number,
  unit?: TaskUnit,
  note?: string,
  effectiveOrgId?: string,
) {
  const task = await (db as any).task.findFirst({
    where: {
      task_id: taskId,
      ...(effectiveOrgId ? { project: { organization_id: effectiveOrgId } } : {}),
    },
  });
  if (!task) throw new TaskNotFoundError(taskId);

  const nonProgressableStatuses: TaskStatus[] = [
    TaskStatus.ARCHIVED,
    TaskStatus.REJECTED,
    TaskStatus.DONE,
  ];
  if (nonProgressableStatuses.includes(task.status)) {
    throw new TaskNotProgressableError(task.status);
  }

  const assignment = await (db as any).taskAssignment.findUnique({
    where: { task_id_user_id: { task_id: taskId, user_id: userId } },
  });
  const user = await (db as any).user.findFirst({
    where: {
      user_id: userId,
      ...(effectiveOrgId ? { organization_id: effectiveOrgId } : {}),
    },
    select: { role: true },
  });

  // Non-admin users must be assigned to the task to log progress.
  // Admins may log progress on any task in their org regardless of assignment.
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  if (!assignment && !isAdmin) throw new AssignmentNotFoundError();

  const resolvedAssignment = assignment ?? await (db as any).taskAssignment.upsert({
    where: { task_id_user_id: { task_id: taskId, user_id: userId } },
    create: { task_id: taskId, user_id: userId },
    update: {},
  });

  const progressLog = await (db as any).taskProgressLog.create({
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

  const updatedTask = await (db as any).task.update({
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
    await (db as any).taskAssignment.updateMany({
      where: { task_id: taskId },
      data: { completed_at: completionTimestamp },
    });
  }

  return { progressLog, updatedTask };
}

// Org-scoped progress log upsert. db is the tx client passed from the service.
export async function upsertProgressLogInOrg(
  db: DbClient,
  taskId: string,
  orgId: string,
  userId: string,
  quantity_done: number,
  unit?: TaskUnit,
  note?: string,
) {
  return upsertProgressLogScoped(db, taskId, userId, quantity_done, unit, note, orgId);
}

// Platform-level progress log upsert (super-admin). db is the tx client passed from the service.
export async function upsertProgressLogPlatform(
  db: DbClient,
  taskId: string,
  userId: string,
  quantity_done: number,
  unit?: TaskUnit,
  note?: string,
) {
  return upsertProgressLogScoped(db, taskId, userId, quantity_done, unit, note);
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
