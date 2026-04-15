import * as cron from "node-cron";
import * as taskRepo from "../repositories/taskRepository";
import * as attachmentRepo from "../repositories/attachmentRepository";
import { sendPushNotification } from "./notificationService";
import { deleteFile } from "./storageService";
import { APP_TIMEZONE } from "../utils/dateUtils";

let initialized = false;

export function initScheduler(): void {
  if (initialized) {
    console.warn("Scheduler already initialized, skipping.");
    return;
  }
  initialized = true;
  // Morning tasks — 06:25 APP_TIMEZONE local time, Mon–Fri
  cron.schedule(
    "25 6 * * 1-5",
    async () => {
      try {
        const groups = await taskRepo.getTodayTasksPerUser(new Date());
        for (const { user_id, push_token, tasks } of groups) {
          const count = tasks.length;
          void sendPushNotification(
            push_token,
            `${count} opgave${count > 1 ? "r" : ""} i dag`,
            "Tryk for at se dagens program",
            { screen: "tasks" },
            user_id,
          );
        }
      } catch (err) {
        console.error("Morning task notification error:", err);
      }
    },
    { timezone: APP_TIMEZONE },
  );

  // Pending attachment cleanup — every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000);
      const stale = await attachmentRepo.getPendingOlderThan(cutoff);
      await Promise.allSettled(
        stale.map(async (a) => {
          await deleteFile(a.gcs_path);
          await attachmentRepo.deleteAttachment(a.attachment_id);
        }),
      );
      if (stale.length > 0) {
        console.log(`Cleaned up ${stale.length} pending attachment(s)`);
      }
    } catch (err) {
      console.error("Pending attachment cleanup error:", err);
    }
  });

  // No activity reminder — 20:00 APP_TIMEZONE local time, Mon–Fri
  cron.schedule(
    "0 20 * * 1-5",
    async () => {
      try {
        const users = await taskRepo.getUsersWithNoActivityToday(new Date());
        for (const { user_id, push_token } of users) {
          void sendPushNotification(
            push_token,
            "Ingen aktivitet i dag",
            "Husk at logge din fremgang",
            { screen: "tasks" },
            user_id,
          );
        }
      } catch (err) {
        console.error("No activity notification error:", err);
      }
    },
    { timezone: APP_TIMEZONE },
  );
}
