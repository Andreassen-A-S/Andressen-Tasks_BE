import { z } from "zod";

export const createTaskSchema = z
  .object({
    project_id: z.string("project_id is required").trim().min(1, "project_id is required"),
  })
  .passthrough();

export const upsertProgressLogSchema = z
  .object({
    quantity_done: z.number("quantity_done is required").positive("quantity_done must be a positive number"),
  })
  .passthrough();
