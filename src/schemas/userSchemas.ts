import { z } from "zod";
import Expo from "expo-server-sdk";

export const registerPushTokenSchema = z.object({
  push_token: z
    .string()
    .refine((v) => Expo.isExpoPushToken(v), { message: "Invalid push token" })
    .nullable()
    .optional(),
});
