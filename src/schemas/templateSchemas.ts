import { z } from "zod";
import { RecurrenceFrequency, TaskPriority, TaskUnit, TaskGoalType } from "../generated/prisma/client";
import { validateRecurringTemplateData } from "../helper/helpers";

export const createTemplateSchema = z
  .object({
    title: z.string("title is required").trim().min(1, "title is required and must be a non-empty string"),
    frequency: z.nativeEnum(RecurrenceFrequency, { error: "frequency must be a valid RecurrenceFrequency" }),
    start_date: z.string("start_date is required").min(1, "start_date is required"),
    end_date: z.string().optional().nullable(),
    interval: z.number().int().positive("interval must be a positive integer").optional(),
    days_of_week: z.array(z.number()).optional().nullable(),
    day_of_month: z.number().int().optional().nullable(),
    project_id: z.string("project_id is required").trim().min(1, "project_id is required"),
    description: z.string().optional().nullable(),
    priority: z.nativeEnum(TaskPriority).optional(),
    unit: z.nativeEnum(TaskUnit).optional(),
    target_quantity: z.number().optional().nullable(),
    goal_type: z.nativeEnum(TaskGoalType).optional(),
    assigned_users: z.array(z.string()).optional(),
    created_by: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const result = validateRecurringTemplateData({
      title: data.title,
      frequency: data.frequency,
      start_date: data.start_date,
      end_date: data.end_date,
      interval: data.interval,
      days_of_week: data.days_of_week,
      day_of_month: data.day_of_month,
    });
    if (!result.isValid) {
      ctx.addIssue({ code: "custom", message: result.error! });
    }
  });

// For update, only validate individual field types.
// Cross-field validation (frequency vs days_of_week/day_of_month) requires
// merging with the existing DB record, so it stays in the controller.
export const updateTemplateSchema = z.object({
  title: z.string().trim().min(1, "title must be a non-empty string").optional(),
  frequency: z.nativeEnum(RecurrenceFrequency).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional().nullable(),
  interval: z.number().int().positive("interval must be a positive integer").optional(),
  days_of_week: z.array(z.number()).optional().nullable(),
  day_of_month: z.number().int().optional().nullable(),
  project_id: z.string().trim().min(1, "project_id must be a non-empty string").optional(),
  description: z.string().optional().nullable(),
  priority: z.nativeEnum(TaskPriority).optional(),
  unit: z.nativeEnum(TaskUnit).optional(),
  target_quantity: z.number().optional().nullable(),
  goal_type: z.nativeEnum(TaskGoalType).optional(),
  assigned_users: z.array(z.string()).optional(),
});
