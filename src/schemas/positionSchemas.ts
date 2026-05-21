import { z } from "zod";

export const createPositionSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
});

export const updatePositionSchema = z.object({
  name: z.string().trim().min(1, "name must be a non-empty string"),
});
