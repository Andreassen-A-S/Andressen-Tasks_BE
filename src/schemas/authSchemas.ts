import { z } from "zod";

export const loginSchema = z.object({
  email: z.string("email is required").trim().min(1, "email is required"),
  password: z.string("password is required").min(1, "password is required"),
  device_name: z.string().trim().max(100).optional(),
});
