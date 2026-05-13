import { Request, Response } from "express";
import * as attachmentService from "../services/attachmentService";
import * as storageService from "../services/storageService";
import { getRequestContext } from "../types/requestContext";
import { getParamId } from "../helper/helpers";
import { AttachmentNotFoundError, AttachmentAccessError, TaskNotFoundError } from "../errors/domainErrors";

const MAX_FILES_PER_REQUEST = 20;

function handleDomainError(error: unknown, res: Response, fallbackMessage: string): Response {
  if (error instanceof AttachmentNotFoundError) {
    return res.status(404).json({ success: false, error: "Attachment not found" });
  }
  if (error instanceof TaskNotFoundError) {
    return res.status(404).json({ success: false, error: "Task not found" });
  }
  if (error instanceof AttachmentAccessError) {
    return res.status(403).json({ success: false, error: "Access denied" });
  }
  if (error instanceof Error && (error as any).code === "TASK_ARCHIVED") {
    return res.status(409).json({ success: false, error: "Task is archived and cannot be modified." });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, error: fallbackMessage });
}

export async function prepareAttachments(req: Request, res: Response) {
  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { task_id, files } = req.body as {
      task_id?: string;
      files?: { file_name?: string; mime_type?: string; file_size?: number }[];
    };

    if (!task_id || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: "task_id and files are required" });
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      return res.status(400).json({ success: false, error: `Maximum ${MAX_FILES_PER_REQUEST} files per request` });
    }

    // Input validation: shape-check each file entry.
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

    const result = await attachmentService.prepareAttachments(
      ctx,
      task_id,
      files.map((f) => ({
        mimeType: f.mime_type as string,
        fileName: f.file_name ?? null,
        fileSize: f.file_size ?? null,
      })),
    );

    res.json({ success: true, data: result });
  } catch (error) {
    return handleDomainError(error, res, "Failed to prepare attachments");
  }
}

export async function getTaskAttachments(req: Request, res: Response) {
  try {
    const taskId = getParamId(req, "taskId");
    if (!taskId) return res.status(400).json({ success: false, error: "Missing taskId" });

    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const attachments = await attachmentService.getAttachmentsByTask(ctx, taskId);
    res.json({ success: true, data: attachments });
  } catch (error) {
    return handleDomainError(error, res, "Failed to fetch attachments");
  }
}

export async function deleteAttachment(req: Request, res: Response) {
  try {
    const attachmentId = getParamId(req, "attachmentId");
    if (!attachmentId) return res.status(400).json({ success: false, error: "Missing attachmentId" });

    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    await attachmentService.deleteAttachment(ctx, attachmentId);

    res.status(204).send();
  } catch (error) {
    return handleDomainError(error, res, "Failed to delete attachment");
  }
}
