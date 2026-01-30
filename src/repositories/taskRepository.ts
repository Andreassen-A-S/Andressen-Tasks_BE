import { prisma } from "../db/prisma";
import {
  TaskPriority,
  TaskStatus,
  type Task,
} from "../generated/prisma/client";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";

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

export async function createTask(data: CreateTaskInput) {
  return prisma.task.create({
    data,
  });
}

export async function updateTask(
  id: string,
  data: UpdateTaskInput,
): Promise<Task> {
  return prisma.task.update({
    where: { task_id: id },
    data,
  });
}

export async function deleteTask(id: string): Promise<void> {
  await prisma.task.delete({
    where: { task_id: id },
  });
}
