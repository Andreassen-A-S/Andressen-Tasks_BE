import { z } from "zod";

export const assignTaskSchema = z.object({
  task_id: z.string("task_id is required").trim().min(1, "task_id is required"),
  user_id: z.string("user_id is required").trim().min(1, "user_id is required"),
});
