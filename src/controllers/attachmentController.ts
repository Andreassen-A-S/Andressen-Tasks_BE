import { Request, Response } from "express";
import { UserRole } from "../generated/prisma/client";
import { prisma } from "../db/prisma";
import * as attachmentRepo from "../repositories/attachmentRepository";
import * as storageService from "../services/storageService";
import { getParamId, requireUserId } from "../helper/helpers";

export async function getUploadUrl(req: Request, res: Response) {
  try {
    const { task_id, file_name, mime_type, file_size } = req.body as {
      task_id?: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };

    if (!task_id || !file_name || !mime_type) {
      return res
        .status(400)
        .json({ success: false, error: "task_id, file_name, and mime_type are required" });
    }

    const MAX_FILE_BYTES = 10 * 1024 * 1024;
    if (file_size !== undefined && file_size > MAX_FILE_BYTES) {
      return res.status(413).json({ success: false, error: "File exceeds maximum size of 10 MB" });
    }

    const userId = requireUserId(req, res);
    if (!userId) return;

    const isAdmin = req.user?.role === UserRole.ADMIN;

    const task = await prisma.task.findUnique({
      where: { task_id },
      include: { assignments: { where: { user_id: userId } } },
    });
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const isCreator = task.created_by === userId;
    const isAssigned = task.assignments.length > 0;
    if (!isCreator && !isAssigned && !isAdmin) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const result = await storageService.generateSignedUploadUrl(task_id, file_name, mime_type);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ success: false, error: "Failed to generate upload URL" });
  }
}

export async function getTaskImages(req: Request, res: Response) {
  try {
    const taskId = getParamId(req, "taskId");
    if (!taskId) return res.status(400).json({ success: false, error: "Missing taskId" });

    const userId = requireUserId(req, res);
    if (!userId) return;

    const isAdmin = req.user?.role === UserRole.ADMIN;

    const task = await prisma.task.findUnique({
      where: { task_id: taskId },
      include: { assignments: { where: { user_id: userId } } },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const isCreator = task.created_by === userId;
    const isAssigned = task.assignments.length > 0;

    if (!isCreator && !isAssigned && !isAdmin) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const images = await attachmentRepo.getImageAttachmentsByTaskId(taskId);
    const imagesWithSignedUrls = await Promise.all(
      images.map(async (img) => ({
        ...img,
        public_url: await storageService.generateSignedReadUrl(img.gcs_path),
      })),
    );
    res.json({ success: true, data: imagesWithSignedUrls });
  } catch (error) {
    console.error("Error fetching task images:", error);
    res.status(500).json({ success: false, error: "Failed to fetch images" });
  }
}

export async function deleteAttachment(req: Request, res: Response) {
  try {
    const attachmentId = getParamId(req, "attachmentId");
    if (!attachmentId) return res.status(400).json({ success: false, error: "Missing attachmentId" });

    const userId = requireUserId(req, res);
    if (!userId) return;

    const isAdmin = req.user?.role === UserRole.ADMIN;

    const attachment = await attachmentRepo.getAttachmentById(attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, error: "Attachment not found" });
    }

    if (attachment.uploaded_by !== userId && !isAdmin) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    await storageService.deleteFile(attachment.gcs_path);
    await attachmentRepo.deleteAttachment(attachmentId);

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting attachment:", error);
    res.status(500).json({ success: false, error: "Failed to delete attachment" });
  }
}
