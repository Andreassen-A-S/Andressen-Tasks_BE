import * as cron from "node-cron";
import * as taskRepo from "../repositories/taskRepository";
import * as taskEventRepo from "../repositories/taskEventRepository";
import * as attachmentRepo from "../repositories/attachmentRepository";
import { sendPushNotification } from "./notificationService";
import { deleteFile } from "./storageService";
import { APP_TIMEZONE } from "../utils/dateUtils";
import { TaskEventType, TaskStatus } from "../generated/prisma/client";

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

  // Auto-archive DONE tasks older than 7 days — daily at 02:00 APP_TIMEZONE
  cron.schedule(
    "0 2 * * *",
    async () => {
      try {
        const staleTasks = await taskRepo.getStaleDoneTasks(7);
        let archivedCount = 0;
        for (const task of staleTasks) {
          try {
            const updated = await taskRepo.updateTask(
              task.task_id,
              { status: TaskStatus.ARCHIVED },
              SYSTEM_USER_ID,
            );
            if (!updated) continue;

            archivedCount++;
            const actor = { connect: { user_id: SYSTEM_USER_ID } } as const;
            const taskConnect = { connect: { task_id: task.task_id } } as const;

            const eventResults = await Promise.allSettled([
              taskEventRepo.createTaskEvent({
                task: taskConnect,
                actor,
                type: TaskEventType.TASK_UPDATED,
                message: "Task auto-archived by scheduler",
                before_json: task,
                after_json: updated,
              }),
              taskEventRepo.createTaskEvent({
                task: taskConnect,
                actor,
                type: TaskEventType.TASK_STATUS_CHANGED,
                message: `Status changed from ${TaskStatus.DONE} to ${TaskStatus.ARCHIVED}`,
                before_json: { status: TaskStatus.DONE },
                after_json: { status: TaskStatus.ARCHIVED },
              }),
            ]);
            for (const result of eventResults) {
              if (result.status === "rejected") {
                console.error(`Failed to write task event for ${task.task_id}:`, result.reason);
              }
            }
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
