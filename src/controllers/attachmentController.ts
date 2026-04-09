import { Request, Response } from "express";
import { UserRole } from "../generated/prisma/client";
import { prisma } from "../db/prisma";
import * as attachmentRepo from "../repositories/attachmentRepository";
import * as storageService from "../services/storageService";
import { getParamId, requireUserId } from "../helper/helpers";

export async function prepareAttachments(req: Request, res: Response) {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { task_id, files } = req.body as {
      task_id?: string;
      files?: { file_name?: string; mime_type?: string; file_size?: number }[];
    };

    if (!task_id || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: "task_id and files are required" });
    }

    if (files.length > 5) {
      return res.status(400).json({ success: false, error: "Maximum 5 files per request" });
    }

    for (const f of files) {
      if (f === null || typeof f !== "object") {
        return res.status(400).json({ success: false, error: "Invalid file entry" });
      }
      if (f.file_name !== undefined && f.file_name !== null && typeof f.file_name !== "string") {
        return res.status(400).json({ success: false, error: "Invalid file_name" });
      }
      if (f.file_size !== undefined && f.file_size !== null && (typeof f.file_size !== "number" || !Number.isFinite(f.file_size) || f.file_size < 0 || !Number.isInteger(f.file_size))) {
        return res.status(400).json({ success: false, error: "Invalid file_size" });
      }
      const mimeConfig = f.mime_type ? storageService.ALLOWED_MIME_TYPES[f.mime_type] : undefined;
      if (!mimeConfig) {
        return res.status(400).json({ success: false, error: "Unsupported file type" });
      }
      if (f.file_size !== undefined && f.file_size !== null && f.file_size > mimeConfig.maxBytes) {
        return res.status(413).json({ success: false, error: `File exceeds maximum size of ${mimeConfig.maxBytes / (1024 * 1024)} MB` });
      }
    }

    const isAdmin = req.user?.role === UserRole.ADMIN;
    const task = await prisma.task.findUnique({
      where: { task_id: task_id },
      include: { assignments: { where: { user_id: userId } } },
    });
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    if (task.created_by !== userId && task.assignments.length === 0 && !isAdmin) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const created: { attachmentId: string; uploadToken: string; uploadUrl: string }[] = [];
    try {
      for (const f of files) {
        const mimeType = f.mime_type as string;
        const { uploadUrl, gcsPath, url } = await storageService.generateSignedUploadUrl(task_id, mimeType);
        const { upload_token, attachment_id } = await attachmentRepo.prepareAttachment({
          taskId: task_id,
          userId,
          mimeType,
          gcsPath,
          url,
          fileName: f.file_name ?? null,
          fileSize: f.file_size ?? null,
        });
        created.push({ attachmentId: attachment_id, uploadToken: upload_token, uploadUrl });
      }
    } catch (error) {
      await Promise.allSettled(
        created.map((c) => attachmentRepo.deleteAttachment(c.attachmentId)),
      );
      throw error;
    }

    res.json({ success: true, data: created.map(({ uploadToken, uploadUrl }) => ({ uploadToken, uploadUrl })) });
  } catch (error) {
    console.error("Error preparing attachments:", error);
    res.status(500).json({ success: false, error: "Failed to prepare attachments" });
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

    if (task.created_by !== userId && task.assignments.length === 0 && !isAdmin) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const images = await attachmentRepo.getImageAttachmentsByTaskId(taskId);
    const imagesWithSignedUrls = await Promise.all(
      images.map(async (img) => ({
        ...img,
        url: await storageService.generateSignedReadUrl(img.gcs_path),
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
