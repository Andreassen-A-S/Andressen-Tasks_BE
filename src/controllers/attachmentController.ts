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

    const { taskId, files } = req.body as {
      taskId?: string;
      files?: { fileName?: string; mimeType?: string; fileSize?: number }[];
    };

    if (!taskId || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: "taskId and files are required" });
    }

    if (files.length > 5) {
      return res.status(400).json({ success: false, error: "Maximum 5 files per request" });
    }

    for (const f of files) {
      if (f === null || typeof f !== "object") {
        return res.status(400).json({ success: false, error: "Invalid file entry" });
      }
      if (f.fileName !== undefined && f.fileName !== null && typeof f.fileName !== "string") {
        return res.status(400).json({ success: false, error: "Invalid fileName" });
      }
      if (f.fileSize !== undefined && f.fileSize !== null && (typeof f.fileSize !== "number" || !Number.isFinite(f.fileSize) || f.fileSize < 0 || !Number.isInteger(f.fileSize))) {
        return res.status(400).json({ success: false, error: "Invalid fileSize" });
      }
      const mimeConfig = f.mimeType ? storageService.ALLOWED_MIME_TYPES[f.mimeType] : undefined;
      if (!mimeConfig) {
        return res.status(400).json({ success: false, error: "Unsupported file type" });
      }
      if (f.fileSize !== undefined && f.fileSize !== null && f.fileSize > mimeConfig.maxBytes) {
        return res.status(413).json({ success: false, error: `File exceeds maximum size of ${mimeConfig.maxBytes / (1024 * 1024)} MB` });
      }
    }

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

    const created: { attachmentId: string; uploadToken: string; uploadUrl: string }[] = [];
    try {
      for (const f of files) {
        const mimeType = f.mimeType as string;
        const { uploadUrl, gcsPath, publicUrl } = await storageService.generateSignedUploadUrl(taskId, mimeType);
        const { upload_token, attachment_id } = await attachmentRepo.prepareAttachment({
          taskId,
          userId,
          mimeType,
          gcsPath,
          publicUrl,
          fileName: f.fileName ?? null,
          fileSize: f.fileSize ?? null,
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
