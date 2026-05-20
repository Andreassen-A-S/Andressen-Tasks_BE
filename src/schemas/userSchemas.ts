import { z } from "zod";
import Expo from "expo-server-sdk";
import { UserRole, UserStatus } from "../generated/prisma/client";

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  position: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  organization_id: z.string().uuid().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  position: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
});

export const registerPushTokenSchema = z.object({
  push_token: z
    .string()
    .refine((v) => Expo.isExpoPushToken(v), { message: "Invalid push token" })
    .nullable()
    .optional(),
});
