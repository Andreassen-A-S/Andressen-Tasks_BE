import { z } from "zod";

export const createTaskSchema = z
  .object({
    project_id: z.string("project_id is required").trim().min(1, "project_id is required"),
  })
  .passthrough();

export const updateTaskSchema = z
  .object({
    title:       z.string().trim().min(1).optional(),
    priority:    z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    status:      z.enum(["PENDING", "IN_PROGRESS", "DONE", "REJECTED", "ARCHIVED"]).optional(),
    deadline:    z.string().datetime({ offset: true }).optional(),
    start_date:  z.string().datetime({ offset: true }).optional(),
    description: z.string().optional(),
    goal:        z.string().nullable().optional(),
    assigned_users: z.array(z.string()).optional(),
    project_id:     z.string().trim().min(1).optional(),
  })
  .strict();

export const upsertProgressLogSchema = z
  .object({
    quantity_done: z.number("quantity_done is required").positive("quantity_done must be a positive number"),
  })
  .passthrough();
