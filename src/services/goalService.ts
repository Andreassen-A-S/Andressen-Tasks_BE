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
    const existing = task.goal;

    if (existing) {
      await taskEventRepo.createTaskEvent(tx, {
        task: taskConnect(taskId),
        actor: actorConnect(ctx.actorUserId),
        type: TaskEventType.TASK_GOAL_REMOVED,
        before_json: { target_quantity: existing.target_quantity, unit: existing.unit },
        after_json: {},
      });
    }

    // createGoal creates the row and atomically updates current_goal_id on the task
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

  const existing = task.goal;
  if (!existing) return null;

  return prisma.$transaction(async (tx) => {
    await goalRepo.removeGoalFromTask(tx, taskId);

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
