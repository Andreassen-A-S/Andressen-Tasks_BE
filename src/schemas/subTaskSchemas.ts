import { z } from "zod";
import { createTaskSchema } from "./taskSchemas";

export const createSubtaskSchema = createTaskSchema.omit({ project_id: true }).extend({
  parent_task_id: z.string().trim().min(1),
});
