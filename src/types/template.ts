import type { TaskPriority, RecurrenceFrequency, TaskUnit } from "../generated/prisma/client";

export interface TemplateGoalInput {
  target_quantity: number;
  current_quantity?: number;
  unit: TaskUnit;
}

export interface CreateTemplateInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  frequency: RecurrenceFrequency;
  interval?: number;
  days_of_week?: number[];
  day_of_month?: number;
  start_date: Date;
  end_date?: Date;
  project_id: string;
  created_by: string;
  assigned_users?: string[];
  goal?: TemplateGoalInput;
}

export interface UpdateTemplateInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  frequency?: RecurrenceFrequency;
  interval?: number;
  days_of_week?: number[];
  day_of_month?: number;
  start_date?: Date;
  end_date?: Date | null;
  project_id?: string;
  assigned_users?: string[];
  goal?: TemplateGoalInput | null;
}
