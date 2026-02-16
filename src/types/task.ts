import type {
  TaskGoalType,
  TaskPriority,
  TaskStatus,
  TaskUnit,
} from "../generated/prisma/client";

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: Date;
  unit?: TaskUnit;
  target_quantity?: number;
  scheduled_date: Date;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  deadline?: Date;
  assigned_users?: string[];
  unit?: TaskUnit;
  target_quantity?: number;
  scheduled_date?: Date;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  status?: TaskStatus;
  deadline: Date;
  parent_task_id?: string;
  scheduled_date: Date;
  created_by: string;
  assigned_users?: string[];
  unit?: TaskUnit;
  target_quantity?: number;
  goal_type?: TaskGoalType;
  current_quantity?: number;
}
