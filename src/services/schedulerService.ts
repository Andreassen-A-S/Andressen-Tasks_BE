import * as cron from "node-cron";
import * as taskRepo from "../repositories/taskRepository";
import * as attachmentRepo from "../repositories/attachmentRepository";
import * as taskService from "./taskService";
import { sendPushNotification } from "./notificationService";
import { deleteFile } from "./storageService";
import { APP_TIMEZONE } from "../utils/dateUtils";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

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

  // Auto-archive DONE tasks older than 7 days — daily at 02:00 APP_TIMEZONE.
  // archiveTask handles event creation and the update atomically in one transaction.
  cron.schedule(
    "0 2 * * *",
    async () => {
      try {
        const staleTasks = await taskRepo.getStaleDoneTasks(7);
        let archivedCount = 0;
        for (const task of staleTasks) {
          try {
            const updated = await taskService.archiveTask(task.task_id, SYSTEM_USER_ID);
            if (updated) archivedCount++;
          } catch (err) {
            console.error(`Failed to archive task ${task.task_id}:`, err);
          }
        }
        if (archivedCount > 0) {
          console.log(`Auto-archived ${archivedCount} task(s)`);
        }
      } catch (err) {
        console.error("Auto-archive task error:", err);
      }
    },
    { timezone: APP_TIMEZONE },
  );

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
