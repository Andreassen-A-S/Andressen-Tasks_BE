import { z } from "zod";
import { TaskUnit } from "../generated/prisma/client";

export const setGoalSchema = z.object({
  target_quantity: z.number().positive("target_quantity must be a positive number"),
  unit: z.nativeEnum(TaskUnit),
});
