import { Request, Response } from "express";
import * as commentService from "../services/commentService";
import * as storageService from "../services/storageService";
import { getParamId } from "../helper/helpers";
import { getRequestContext } from "../types/requestContext";
import { CreateCommentRequest } from "../types/comment";

export async function listTaskComments(req: Request, res: Response) {
  const taskId = getParamId(req, "taskId");
  if (!taskId) return res.status(400).json({ success: false, error: "Missing taskId" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const comments = await commentService.getCommentsByTaskId(ctx, taskId);

  if (comments === null) return res.status(404).json({ success: false, error: "Task not found" });

  res.json({ success: true, data: comments });
}

export async function createComment(req: Request, res: Response) {
  const taskId = getParamId(req, "taskId");
  if (!taskId) return res.status(400).json({ success: false, error: "Missing taskId" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { message, upload_tokens } = req.body as CreateCommentRequest;
  const hasTokens = Array.isArray(upload_tokens) && upload_tokens.length > 0;

  const comment = await commentService.createComment(
    ctx,
    taskId,
    message?.trim(),
    hasTokens ? upload_tokens : undefined,
  );

  if (comment === null) return res.status(404).json({ success: false, error: "Task not found" });

  const commentWithSignedUrls = {
    ...comment,
    attachments: await Promise.all(
      comment.attachments.map(async (att: any) => ({
        ...att,
        url: await storageService.generateSignedReadUrl(att.gcs_path).catch(() => att.url),
      })),
    ),
  };

  res.status(201).json({ success: true, data: commentWithSignedUrls });
}

export async function deleteComment(req: Request, res: Response) {
  const commentId = getParamId(req, "commentId");
  if (!commentId) return res.status(400).json({ success: false, error: "Missing commentId" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  await commentService.deleteComment(ctx, commentId);

  res.status(204).send();
}

export async function updateComment(req: Request, res: Response) {
  const commentId = getParamId(req, "commentId");
  if (!commentId) return res.status(400).json({ success: false, error: "Missing commentId" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { message, upload_tokens, remove_attachment_ids } = req.body;

  const trimmedMessage = message !== undefined ? (message as string).trim() : undefined;
  const hasMessage = trimmedMessage !== undefined && trimmedMessage.length > 0;
  const hasTokens = Array.isArray(upload_tokens) && upload_tokens.length > 0;
  const hasRemovals = Array.isArray(remove_attachment_ids) && remove_attachment_ids.length > 0;

  const updatedComment = await commentService.updateComment(
    ctx,
    commentId,
    hasMessage ? trimmedMessage : undefined,
    hasTokens ? upload_tokens : undefined,
    hasRemovals ? remove_attachment_ids : undefined,
  );

  res.json({ success: true, data: updatedComment });
}
