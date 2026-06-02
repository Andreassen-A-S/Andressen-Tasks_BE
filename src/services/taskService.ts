import {
  TaskEventType,
  TaskPriority,
  TaskStatus,
  UserRole,
  type TaskUnit,
} from "../generated/prisma/client";
import { TaskForbiddenError } from "../errors/domainErrors";
import * as taskEventRepo from "../repositories/taskEventRepository";
import * as taskRepo from "../repositories/taskRepository";
import * as userRepo from "../repositories/userRepository";
import { sendPushNotification } from "./notificationService";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";
import type { RequestContext } from "../types/requestContext";
import { appDateKey } from "../utils/dateUtils";
import { prisma } from "../db/prisma";

function actorConnect(userId: string) {
  return { connect: { user_id: userId } } as const;
}

function taskConnect(taskId: string) {
  return { connect: { task_id: taskId } } as const;
}

function emptyObj() {
  return {} as Record<string, never>;
}

export async function listTasks(ctx: RequestContext) {
  return taskRepo.getAllTasks(ctx.effectiveOrgId);
}

export async function getTask(ctx: RequestContext, taskId: string) {
  return taskRepo.getTaskById(taskId, ctx.effectiveOrgId);
}

export async function createTask(ctx: RequestContext, input: CreateTaskInput) {
  // Always attribute the task to the authenticated actor, regardless of what the client sends.
  const normalizedInput: CreateTaskInput = { ...input, created_by: ctx.actorUserId };

  const task = await prisma.$transaction(async (tx) => {
    const created = await taskRepo.createTaskWithAssignments(tx, normalizedInput, ctx.effectiveOrgId);
    if (!created) return null;

    await taskEventRepo.createTaskEvent(tx, {
      task: taskConnect(created.task_id),
      actor: actorConnect(ctx.actorUserId),
      type: TaskEventType.TASK_CREATED,
      message: "Task created",
      before_json: emptyObj(),
      after_json: created,
    });

    if (created.assignments && created.assignments.length > 0) {
      await Promise.all(
        created.assignments.map((assignment: any) =>
          taskEventRepo.createTaskEvent(tx, {
            task: taskConnect(created.task_id),
            actor: actorConnect(ctx.actorUserId),
            type: TaskEventType.ASSIGNMENT_CREATED,
            message: "Created assignment",
            assignment: { connect: { assignment_id: assignment.assignment_id } },
            before_json: undefined,
            after_json: assignment,
          }),
        ),
      );
    }
    return created;
  });

  if (!task) return null;

  // Push notifications fire after the transaction commits so they don't run if the tx rolls back.
  if (task.assignments && task.assignments.length > 0) {
    const tokenMap = await userRepo.getPushTokensForUsers(task.assignments.map((a: any) => a.user_id));
    for (const [userId, pushToken] of tokenMap) {
      void sendPushNotification(
        pushToken,
        "Ny opgave tildelt",
        `Du er blevet tildelt: ${task.title}`,
        { taskId: task.task_id },
        userId,
      );
    }
  }

  const { assignments, current_goal, ...taskData } = task;
  return { ...taskData, assigned_users: assignments.map((a: any) => a.user_id), goal: current_goal ?? null };
}

export async function updateTask(ctx: RequestContext, taskId: string, updateData: UpdateTaskInput) {
  const actor = actorConnect(ctx.actorUserId);

  // Read old state before transaction for assignment diff / notification logic.
  const oldTask = await taskRepo.getTaskById(taskId, ctx.effectiveOrgId);
  if (!oldTask) return null;

  const isAdmin = ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN;
  if (!isAdmin && oldTask.created_by !== ctx.actorUserId && !oldTask.assigned_users.includes(ctx.actorUserId)) {
    throw new TaskForbiddenError();
  }

  const updatedTask = await prisma.$transaction(async (tx) => {
    const updated = ctx.effectiveOrgId
      ? await taskRepo.updateTaskInOrg(tx, taskId, ctx.effectiveOrgId, updateData, ctx.actorUserId)
      : await taskRepo.updateTaskPlatform(tx, taskId, updateData, ctx.actorUserId);
    if (!updated) return null;

    const tConnect = taskConnect(updated.task_id);
    const events: Promise<unknown>[] = [];

    if (updateData.assigned_users !== undefined) {
      const oldUserIds = new Set(oldTask.assigned_users ?? []);
      const added = updated.assignments.filter((a: any) => !oldUserIds.has(a.user_id));
      const removedUserIds = (oldTask.assigned_users ?? []).filter(
        (uid) => !updated.assignments.some((a: any) => a.user_id === uid),
      );

      events.push(
        ...added.map((assignment: any) =>
          taskEventRepo.createTaskEvent(tx, {
            task: tConnect,
            actor,
            type: TaskEventType.ASSIGNMENT_CREATED,
            message: "Created assignment",
            assignment: { connect: { assignment_id: assignment.assignment_id } },
            before_json: undefined,
            after_json: assignment,
          }),
        ),
        ...removedUserIds.map((uid) => {
          const removedUser = (oldTask as any).assignment_users?.find((u: any) => u.user_id === uid);
          return taskEventRepo.createTaskEvent(tx, {
            task: tConnect,
            actor,
            type: TaskEventType.ASSIGNMENT_DELETED,
            message: "Deleted assignment",
            before_json: { user_id: uid, name: removedUser?.name ?? null, email: removedUser?.email ?? null },
            after_json: emptyObj(),
          });
        }),
      );
    }

    if (updateData.title !== undefined && updateData.title !== oldTask.title) {
      events.push(taskEventRepo.createTaskEvent(tx, {
        task: tConnect, actor,
        type: TaskEventType.TASK_TITLE_CHANGED,
        before_json: { title: oldTask.title },
        after_json: { title: updated.title },
      }));
    }

    if (updateData.description !== undefined && updateData.description !== oldTask.description) {
      events.push(taskEventRepo.createTaskEvent(tx, {
        task: tConnect, actor,
        type: TaskEventType.TASK_DESCRIPTION_CHANGED,
        before_json: { description: oldTask.description },
        after_json: { description: updated.description },
      }));
    }

    if (updateData.priority !== undefined && updateData.priority !== oldTask.priority) {
      events.push(taskEventRepo.createTaskEvent(tx, {
        task: tConnect, actor,
        type: TaskEventType.TASK_PRIORITY_CHANGED,
        before_json: { priority: oldTask.priority },
        after_json: { priority: updated.priority },
      }));
    }

    if (updateData.deadline !== undefined && String(updateData.deadline) !== String(oldTask.deadline)) {
      events.push(taskEventRepo.createTaskEvent(tx, {
        task: tConnect, actor,
        type: TaskEventType.TASK_DUE_DATE_CHANGED,
        before_json: { deadline: oldTask.deadline },
        after_json: { deadline: updated.deadline },
      }));
    }

    if (updateData.start_date !== undefined && String(updateData.start_date) !== String(oldTask.start_date)) {
      events.push(taskEventRepo.createTaskEvent(tx, {
        task: tConnect, actor,
        type: TaskEventType.TASK_START_DATE_CHANGED,
        before_json: { start_date: oldTask.start_date },
        after_json: { start_date: updated.start_date },
      }));
    }

    if (updateData.project_id !== undefined && updateData.project_id !== oldTask.project_id) {
      events.push(taskEventRepo.createTaskEvent(tx, {
        task: tConnect, actor,
        type: TaskEventType.TASK_PROJECT_CHANGED,
        before_json: { project_id: oldTask.project_id, project_name: (oldTask as any).project?.name ?? null },
        after_json: { project_id: updated.project_id, project_name: (updated as any).project?.name ?? null },
      }));
    }

    if (updateData.status && oldTask.status !== updated.status) {
      events.push(
        taskEventRepo.createTaskEvent(tx, {
          task: tConnect,
          actor,
          type: TaskEventType.TASK_STATUS_CHANGED,
          message: `Status changed from ${oldTask.status} to ${updated.status}`,
          before_json: { status: oldTask.status },
          after_json: { status: updated.status },
        }),
      );
    }

    await Promise.all(events);
    return updated;
  });

  if (!updatedTask) return null;

  // Push notifications fire after transaction commits.
  if (updateData.assigned_users !== undefined) {
    const oldUserIds = new Set(oldTask.assigned_users ?? []);
    const added = updatedTask.assignments.filter((a: any) => !oldUserIds.has(a.user_id));
    const tokenMap = await userRepo.getPushTokensForUsers(added.map((a: any) => a.user_id));
    for (const [uid, pushToken] of tokenMap) {
      void sendPushNotification(
        pushToken,
        "Ny opgave tildelt",
        `Du er blevet tildelt: ${updatedTask.title}`,
        { taskId: updatedTask.task_id },
        uid,
      );
    }
  }

  if (updateData.status && oldTask.status !== updatedTask.status && updatedTask.status === TaskStatus.DONE) {
    const admins = await userRepo.getAdminPushTokens(ctx.effectiveOrgId);
    for (const { user_id, push_token } of admins) {
      void sendPushNotification(
        push_token,
        "Opgave afsluttet",
        updatedTask.title,
        { taskId: updatedTask.task_id },
        user_id,
      );
    }
  }

  const priorityChangedToHigh =
    updateData.priority === TaskPriority.HIGH && oldTask.priority !== TaskPriority.HIGH;
  const taskIsActive =
    updatedTask.start_date !== null &&
    appDateKey(updatedTask.start_date) <= appDateKey() &&
    updatedTask.status !== TaskStatus.DONE &&
    updatedTask.status !== TaskStatus.REJECTED &&
    updatedTask.status !== TaskStatus.ARCHIVED;

  if (priorityChangedToHigh && taskIsActive && updatedTask.assignments.length > 0) {
    const tokenMap = await userRepo.getPushTokensForUsers(
      updatedTask.assignments.map((a: any) => a.user_id),
    );
    for (const [uid, pushToken] of tokenMap) {
      void sendPushNotification(
        pushToken,
        "Prioritet ændret",
        `${updatedTask.title} – prioritet ændret til høj`,
        { taskId: updatedTask.task_id },
        uid,
      );
    }
  }

  const { assignments, current_goal, ...taskData } = updatedTask;
  return { ...taskData, assigned_users: assignments.map((a: any) => a.user_id), goal: current_goal ?? null };
}

export async function deleteTask(ctx: RequestContext, taskId: string) {
  const task = await taskRepo.getTaskById(taskId, ctx.effectiveOrgId);
  if (!task) return false;

  await prisma.$transaction(async (tx) => {
    // Events written before deletion to preserve audit trail (cascade would remove them otherwise).
    const eventWrites = [
      taskEventRepo.createTaskEvent(tx, {
        task: taskConnect(task.task_id),
        actor: actorConnect(ctx.actorUserId),
        type: TaskEventType.TASK_DELETED,
        before_json: task,
        after_json: emptyObj(),
      }),
    ];

    if ((task as any).parent_task_id) {
      eventWrites.push(
        taskEventRepo.createTaskEvent(tx, {
          task: taskConnect((task as any).parent_task_id),
          actor: actorConnect(ctx.actorUserId),
          type: TaskEventType.SUBTASK_REMOVED,
          before_json: { task_id: task.task_id, title: (task as any).title },
          after_json: emptyObj(),
        }),
      );
    }

    await Promise.all(eventWrites);

    if (ctx.effectiveOrgId) {
      await taskRepo.deleteTaskInOrg(tx, taskId, ctx.effectiveOrgId);
    } else {
      await taskRepo.deleteTaskPlatform(tx, taskId);
    }
  });

  return true;
}

export async function upsertProgressLog(
  ctx: RequestContext,
  taskId: string,
  quantityDone: number,
  unit?: TaskUnit,
  note?: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    const { progressLog, updatedTask } = ctx.effectiveOrgId
      ? await taskRepo.upsertProgressLogInOrg(tx, taskId, ctx.effectiveOrgId, ctx.actorUserId, quantityDone, unit, note)
      : await taskRepo.upsertProgressLogPlatform(tx, taskId, ctx.actorUserId, quantityDone, unit, note);

    await taskEventRepo.createTaskEvent(tx, {
      task: taskConnect(taskId),
      actor: actorConnect(ctx.actorUserId),
      type: TaskEventType.PROGRESS_LOGGED,
      message: `Logged progress: ${quantityDone} ${unit || "units"}`,
      progress: { connect: { progress_id: progressLog.progress_id } },
      before_json: emptyObj(),
      after_json: progressLog,
    });

    return { progressLog, updatedTask };
  });

  // Notify admins after transaction commits.
  void (async () => {
    try {
      const admins = await userRepo.getAdminPushTokens(ctx.effectiveOrgId);
      for (const { user_id: adminId, push_token } of admins) {
        if (adminId === ctx.actorUserId) continue;
        void sendPushNotification(
          push_token,
          "Fremgang logget",
          result.updatedTask.title,
          { taskId: result.updatedTask.task_id },
          adminId,
        );
      }
    } catch (err) {
      console.error("Failed to notify admins of progress log:", err);
    }
  })();

  return {
    progressLog: result.progressLog,
    task: {
      status: result.updatedTask.status,
      goal: result.updatedTask.goal ?? null,
    },
  };
}

// Used by the auto-archive scheduler to transition DONE tasks to ARCHIVED.
// Runs as SYSTEM_USER_ID; creates a TASK_STATUS_CHANGED event atomically.
export async function archiveTask(
  taskId: string,
  systemUserId: string,
) {
  const task = await taskRepo.getTaskById(taskId, null); // platform-level read
  if (!task) return null;

  return prisma.$transaction(async (tx) => {
    const updated = await taskRepo.updateTaskPlatform(
      tx,
      taskId,
      { status: TaskStatus.ARCHIVED },
      systemUserId,
    );
    if (!updated) return null;

    const actor = actorConnect(systemUserId);
    const tConnect = taskConnect(taskId);
    await taskEventRepo.createTaskEvent(tx, {
      task: tConnect,
      actor,
      type: TaskEventType.TASK_STATUS_CHANGED,
      before_json: { status: TaskStatus.DONE },
      after_json: { status: TaskStatus.ARCHIVED },
    });
    return updated;
  });
}

// Returns task events for a task, if the caller has access.
// Access: task creator, assigned users, admins, and super-admins.
// Returns null if the task is not found or the caller has no access (treated as not-found).
export async function getTaskEvents(ctx: RequestContext, taskId: string) {
  const task = await prisma.task.findFirst({
    where: {
      task_id: taskId,
      ...(ctx.effectiveOrgId ? { project: { organization_id: ctx.effectiveOrgId } } : {}),
    },
    include: { assignments: { where: { user_id: ctx.actorUserId } } },
  });

  if (!task) return null;

  const isAdmin = ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN;
  const canAccess =
    isAdmin || task.created_by === ctx.actorUserId || task.assignments.length > 0;

  if (!canAccess) return null;

  return taskEventRepo.getTaskEventsByTaskId(taskId);
}
