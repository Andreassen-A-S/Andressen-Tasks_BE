import * as cron from "node-cron";
import * as taskRepo from "../repositories/taskRepository";
import { sendPushNotification } from "./notificationService";

let initialized = false;

export function initScheduler(): void {
  if (initialized) {
    console.warn("Scheduler already initialized, skipping.");
    return;
  }
  initialized = true;
  // Morning tasks — 06:25 CET, Mon–Fri
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
    { timezone: "Europe/Copenhagen" },
  );

  // No activity reminder — 20:00 CET, Mon–Fri
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
    { timezone: "Europe/Copenhagen" },
  );
}
