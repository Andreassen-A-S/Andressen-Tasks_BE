import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string("name is required").trim().min(1, "name is required"),
  description: z.string().optional(),
  color: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "name must be a non-empty string").optional(),
  description: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
});
