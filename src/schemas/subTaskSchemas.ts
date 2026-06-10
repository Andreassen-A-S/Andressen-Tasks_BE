import { z } from "zod";
import { createTaskSchema } from "./taskSchemas";

export const createSubtaskSchema = createTaskSchema.extend({
  parent_task_id: z.string().trim().min(1),
});
