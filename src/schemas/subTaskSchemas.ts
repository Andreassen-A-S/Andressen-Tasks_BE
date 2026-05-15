import { z } from "zod";

export const createSubtaskSchema = z
  .object({
    parent_task_id: z.string("parent_task_id is required").trim().min(1, "parent_task_id is required"),
  })
  .passthrough();
