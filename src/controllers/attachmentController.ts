import { Request, Response } from "express";
import * as attachmentService from "../services/attachmentService";
import { getRequestContext } from "../types/requestContext";
import { getParamId } from "../helper/helpers";

export async function prepareAttachments(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { task_id, files } = req.body as {
    task_id: string;
    files: {
      file_name?: string | null;
      mime_type: string;
      file_size?: number | null;
      width?: number | null;
      height?: number | null;
    }[];
  };

  const result = await attachmentService.prepareAttachments(
    ctx,
    task_id,
    files.map((f) => ({
      mimeType: f.mime_type as string,
      fileName: f.file_name ?? null,
      fileSize: f.file_size ?? null,
      width: f.width ?? null,
      height: f.height ?? null,
    })),
  );

  res.json({ success: true, data: result });
}

export async function getTaskAttachments(req: Request, res: Response) {
  const taskId = getParamId(req, "taskId");
  if (!taskId) return res.status(400).json({ success: false, error: "Missing taskId" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const attachments = await attachmentService.getAttachmentsByTask(ctx, taskId);
  res.json({ success: true, data: attachments });
}

export async function deleteAttachment(req: Request, res: Response) {
  const attachmentId = getParamId(req, "attachmentId");
  if (!attachmentId) return res.status(400).json({ success: false, error: "Missing attachmentId" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  await attachmentService.deleteAttachment(ctx, attachmentId);

  res.status(204).send();
}
