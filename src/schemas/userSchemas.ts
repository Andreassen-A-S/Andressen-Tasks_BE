import { z } from "zod";
import Expo from "expo-server-sdk";
import { UserRole, UserStatus } from "../generated/prisma/client";
import { ALLOWED_MIME_TYPES } from "../services/storageService";
import { isUserProfilePicturePath } from "../repositories/userRepository";

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  position_id: z.string().uuid().optional(),
  role: z.nativeEnum(UserRole).optional(),
  organization_id: z.string().uuid().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  position_id: z.string().uuid().nullable().optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  profile_picture_url: z.string().refine(isUserProfilePicturePath, { message: "Invalid profile_picture_url" }).nullable().optional(),
});

export const prepareProfilePictureSchema = z.object({
  mime_type: z.string().refine(
    (v) => v.startsWith("image/") && !!ALLOWED_MIME_TYPES[v],
    { message: "Unsupported profile picture mime_type" },
  ),
  file_size: z.number().int().nonnegative(),
});

export const registerPushTokenSchema = z.object({
  push_token: z
    .string()
    .refine((v) => Expo.isExpoPushToken(v), { message: "Invalid push token" })
    .nullable()
    .optional(),
});
