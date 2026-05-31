import type {
  TaskPriority,
  TaskStatus,
  TaskUnit,
} from "../generated/prisma/client";

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  deadline?: Date;
  project_id?: string;
  assigned_users?: string[];
  start_date?: Date;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  status?: TaskStatus;
  deadline: Date;
  parent_task_id?: string;
  start_date: Date;
  created_by: string;
  project_id: string;
  assigned_users?: string[];
  goal?: {
    target_quantity: number;
    unit: TaskUnit;
    current_quantity?: number;
  };
}

export interface CreateGoalInput {
  target_quantity: number;
  unit: TaskUnit;
  current_quantity?: number;
}
