import type { DbClient } from "../types/db";
import { prisma } from "../db/prisma";
import type { CreateGoalInput } from "../types/task";

export async function getActiveGoal(db: DbClient, taskId: string) {
  return (db as any).taskGoal.findFirst({
    where: { task_id: taskId, removed_at: null },
  });
}

export async function createGoal(db: DbClient, taskId: string, input: CreateGoalInput) {
  return (db as any).taskGoal.create({
    data: {
      task_id: taskId,
      target_quantity: input.target_quantity,
      unit: input.unit,
      current_quantity: 0,
    },
  });
}

export async function softRemoveGoal(db: DbClient, goalId: string) {
  return (db as any).taskGoal.update({
    where: { goal_id: goalId },
    data: { removed_at: new Date() },
  });
}

export async function updateGoalCurrentQuantity(db: DbClient, goalId: string, currentQuantity: number) {
  return (db as any).taskGoal.update({
    where: { goal_id: goalId },
    data: { current_quantity: currentQuantity },
  });
}

export async function getActiveGoalByTask(taskId: string) {
  return prisma.taskGoal.findFirst({
    where: { task_id: taskId, removed_at: null },
  });
}
