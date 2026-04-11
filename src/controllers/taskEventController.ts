import type { Request, Response } from "express";
import * as taskEventRepo from "../repositories/taskEventRepository";
import * as storageService from "../services/storageService";

export async function listTaskEvents(req: Request, res: Response) {
  const taskId = req.params.taskId as string;
  try {
    const events = await taskEventRepo.getTaskEventsByTaskId(taskId);

    const eventsWithSignedUrls = await Promise.all(
      events.map(async (event) => {
        if (!event.comment || !(event.comment as any).attachments?.length) return event;
        const attachments = (event.comment as any).attachments as { gcs_path: string; [key: string]: any }[];
        const signedAttachments = await Promise.all(
          attachments.map(async (a) => ({ ...a, url: await storageService.generateSignedReadUrl(a.gcs_path) }))
        );
        return { ...event, comment: { ...event.comment, attachments: signedAttachments } };
      })
    );

    res.json({ success: true, data: eventsWithSignedUrls });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch events" });
  }
}

export async function createTaskEvent(req: Request, res: Response) {
  try {
    const event = await taskEventRepo.createTaskEvent(req.body);
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(400).json({ success: false, error: "Failed to create event" });
  }
}
