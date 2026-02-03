import type { TaskPriority, TaskStatus } from "../generated/prisma/client";

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: Date;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  deadline?: Date;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  status?: TaskStatus;
  deadline: Date;
  created_by: string;
  assigned_users?: string[];
}
