import type { DbClient } from "../types/db";
import type { CreateGoalInput } from "../types/task";

export async function createGoal(db: DbClient, taskId: string, input: CreateGoalInput) {
  const goal = await (db as any).taskGoal.create({
    data: {
      task_id: taskId,
      target_quantity: input.target_quantity,
      unit: input.unit,
      current_quantity: input.current_quantity ?? 0,
    },
  });
  await (db as any).task.update({
    where: { task_id: taskId },
    data: { current_goal_id: goal.goal_id },
  });
  return goal;
}

export async function removeGoalFromTask(db: DbClient, taskId: string) {
  return (db as any).task.update({
    where: { task_id: taskId },
    data: { current_goal_id: null },
  });
}

export async function updateGoalCurrentQuantity(db: DbClient, goalId: string, currentQuantity: number) {
  return (db as any).taskGoal.update({
    where: { goal_id: goalId },
    data: { current_quantity: currentQuantity },
  });
}
