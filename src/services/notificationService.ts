import Expo, {
  type ExpoPushMessage,
  type ExpoPushErrorTicket,
} from "expo-server-sdk";
import { updatePushToken } from "../repositories/userRepository";

const expo = new Expo();

export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  userId?: string,
): Promise<void> {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error(`Invalid Expo push token: ${pushToken}`);
    return;
  }

  const message: ExpoPushMessage = {
    to: pushToken,
    sound: "default",
    title,
    body,
    data,
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets) {
        if (ticket.status === "error") {
          const error = (ticket as ExpoPushErrorTicket).details?.error;
          console.error(`Push notification error [${error ?? "unknown"}]:`, ticket.message);
          if (error === "DeviceNotRegistered" && userId) {
            await updatePushToken(userId, null);
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to send push notification:", err);
  }
}
