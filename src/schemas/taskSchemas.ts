import { z } from "zod";
import { TaskPriority, TaskStatus, TaskUnit } from "../generated/prisma/client";

const priorityEnum = z.nativeEnum(TaskPriority);
const statusEnum   = z.nativeEnum(TaskStatus);
const unitEnum     = z.nativeEnum(TaskUnit);
const datetime     = z.string().datetime({ offset: true });

export const createTaskSchema = z.object({
  project_id:     z.string().trim().min(1),
  title:          z.string().trim().min(1),
  priority:       priorityEnum,
  deadline:       datetime,
  start_date:     datetime,
  description:    z.string().optional(),
  status:         statusEnum.optional(),
  assigned_users: z.array(z.string()).optional(),
  parent_task_id: z.string().optional(),
  goal: z.object({
    target_quantity:  z.number().positive(),
    unit:             unitEnum,
    current_quantity: z.number().min(0).optional(),
  }).optional(),
});

export const updateTaskSchema = z.object({
  title:          z.string().trim().min(1).optional(),
  priority:       priorityEnum.optional(),
  status:         statusEnum.optional(),
  deadline:       datetime.optional(),
  start_date:     datetime.optional(),
  description:    z.string().optional(),
  assigned_users: z.array(z.string()).optional(),
  project_id:     z.string().trim().min(1).optional(),
}).strict();

export const upsertProgressLogSchema = z
  .object({
    quantity_done: z.number("quantity_done is required").positive("quantity_done must be a positive number"),
  })
  .passthrough();
