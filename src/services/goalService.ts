import { prisma } from "../db/prisma";
import { TaskEventType, TaskStatus, UserRole } from "../generated/prisma/client";
import * as goalRepo from "../repositories/goalRepository";
import * as taskRepo from "../repositories/taskRepository";
import * as taskEventRepo from "../repositories/taskEventRepository";
import type { RequestContext } from "../types/requestContext";
import type { CreateGoalInput } from "../types/task";
import { TaskNotFoundError, TaskArchivedError, TaskForbiddenError } from "../errors/domainErrors";

function taskConnect(taskId: string) {
  return { connect: { task_id: taskId } } as const;
}

function actorConnect(userId: string) {
  return { connect: { user_id: userId } } as const;
}

export async function setGoal(ctx: RequestContext, taskId: string, input: CreateGoalInput) {
  const task = await taskRepo.getTaskById(taskId, ctx.effectiveOrgId);
  if (!task) throw new TaskNotFoundError(taskId);
  if (task.status === TaskStatus.ARCHIVED) throw new TaskArchivedError();

  const isAdmin = ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN;
  if (!isAdmin && task.created_by !== ctx.actorUserId && !task.assigned_users.includes(ctx.actorUserId)) {
    throw new TaskForbiddenError();
  }

  return prisma.$transaction(async (tx) => {
    const existing = await goalRepo.getActiveGoal(tx, taskId);

    if (existing) {
      await goalRepo.softRemoveGoal(tx, existing.goal_id);
      await taskEventRepo.createTaskEvent(tx, {
        task: taskConnect(taskId),
        actor: actorConnect(ctx.actorUserId),
        type: TaskEventType.TASK_GOAL_REMOVED,
        before_json: { target_quantity: existing.target_quantity, unit: existing.unit },
        after_json: {},
      });
    }

    const goal = await goalRepo.createGoal(tx, taskId, input);

    await taskEventRepo.createTaskEvent(tx, {
      task: taskConnect(taskId),
      actor: actorConnect(ctx.actorUserId),
      type: TaskEventType.TASK_GOAL_SET,
      before_json: {},
      after_json: { target_quantity: goal.target_quantity, unit: goal.unit },
    });

    return goal;
  });
}

export async function removeGoal(ctx: RequestContext, taskId: string) {
  const task = await taskRepo.getTaskById(taskId, ctx.effectiveOrgId);
  if (!task) throw new TaskNotFoundError(taskId);
  if (task.status === TaskStatus.ARCHIVED) throw new TaskArchivedError();

  const isAdmin = ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN;
  if (!isAdmin && task.created_by !== ctx.actorUserId && !task.assigned_users.includes(ctx.actorUserId)) {
    throw new TaskForbiddenError();
  }

  return prisma.$transaction(async (tx) => {
    const existing = await goalRepo.getActiveGoal(tx, taskId);
    if (!existing) return null;

    await goalRepo.softRemoveGoal(tx, existing.goal_id);

    await taskEventRepo.createTaskEvent(tx, {
      task: taskConnect(taskId),
      actor: actorConnect(ctx.actorUserId),
      type: TaskEventType.TASK_GOAL_REMOVED,
      before_json: { target_quantity: existing.target_quantity, unit: existing.unit },
      after_json: {},
    });

    return existing;
  });
}
