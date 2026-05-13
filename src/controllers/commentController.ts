import { Request, Response } from "express";
import * as commentService from "../services/commentService";
import * as storageService from "../services/storageService";
import { getParamId } from "../helper/helpers";
import { getRequestContext } from "../types/requestContext";
import { CreateCommentRequest } from "../types/comment";
import {
  CommentNotFoundError,
  CommentForbiddenError,
} from "../errors/domainErrors";

function handleDomainError(error: unknown, res: Response, fallbackMessage: string): Response {
  if (error instanceof CommentNotFoundError) {
    return res.status(404).json({ success: false, error: "Comment not found" });
  }
  if (error instanceof CommentForbiddenError) {
    return res.status(403).json({ success: false, error: error.message });
  }
  if (error instanceof Error && (error as any).code === "TASK_ARCHIVED") {
    return res.status(409).json({ success: false, error: "Task is archived and cannot be modified." });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, error: fallbackMessage });
}

export async function listTaskComments(req: Request, res: Response) {
  try {
    const taskId = getParamId(req, "taskId");
    if (!taskId) return res.status(400).json({ success: false, error: "Missing taskId" });

    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const comments = await commentService.getCommentsByTaskId(ctx, taskId);

    if (comments === null) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    res.json({ success: true, data: comments });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ success: false, error: "Failed to fetch comments" });
  }
}

export async function createComment(req: Request, res: Response) {
  try {
    const taskId = getParamId(req, "taskId");
    if (!taskId) return res.status(400).json({ success: false, error: "Missing taskId" });

    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { message, upload_tokens } = req.body as CreateCommentRequest;

    const hasTokens = Array.isArray(upload_tokens) && upload_tokens.length > 0;

    if (!message?.trim() && !hasTokens) {
      return res
        .status(400)
        .json({ success: false, error: "Message or attachment is required" });
    }

    if (message && message.trim().length > 2000) {
      return res.status(400).json({
        success: false,
        error: "Message too long (max 2000 characters)",
      });
    }

    if (hasTokens && upload_tokens!.some((t) => typeof t !== "string")) {
      return res.status(400).json({ success: false, error: "Invalid upload tokens" });
    }

    if (hasTokens && new Set(upload_tokens!).size !== upload_tokens!.length) {
      return res.status(400).json({ success: false, error: "Duplicate upload tokens" });
    }

    let comment;
    try {
      comment = await commentService.createComment(
        ctx,
        taskId,
        message?.trim(),
        hasTokens ? upload_tokens : undefined,
      );
    } catch (err) {
      if (err instanceof Error && err.message === "One or more upload tokens are invalid or expired") {
        return res.status(400).json({ success: false, error: err.message });
      }
      if (err instanceof Error && (err as any).code === "TASK_ARCHIVED") {
        return res.status(409).json({ success: false, error: "Task is archived and cannot be modified." });
      }
      throw err;
    }

    if (comment === null) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

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
  } catch (error) {
    console.error("Error creating comment:", error);
    res.status(500).json({ success: false, error: "Failed to create comment" });
  }
}

export async function deleteComment(req: Request, res: Response) {
  try {
    const commentId = getParamId(req, "commentId");
    if (!commentId) return res.status(400).json({ success: false, error: "Missing commentId" });

    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    await commentService.deleteComment(ctx, commentId);

    res.status(204).send();
  } catch (error) {
    return handleDomainError(error, res, "Failed to delete comment");
  }
}

export async function updateComment(req: Request, res: Response) {
  try {
    const commentId = getParamId(req, "commentId");
    if (!commentId) return res.status(400).json({ success: false, error: "Missing commentId" });

    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    if (!req.body) {
      return res
        .status(400)
        .json({ success: false, error: "Missing request body" });
    }
    const { message, upload_tokens, remove_attachment_ids } = req.body;

    if (message !== undefined && typeof message !== "string") {
      return res.status(400).json({ success: false, error: "Invalid message" });
    }

    const trimmedMessage = message !== undefined ? (message as string).trim() : undefined;

    if (trimmedMessage !== undefined && trimmedMessage.length > 2000) {
      return res.status(400).json({
        success: false,
        error: "Message too long (max 2000 characters)",
      });
    }

    if (upload_tokens !== undefined && !Array.isArray(upload_tokens)) {
      return res.status(400).json({ success: false, error: "Invalid upload tokens" });
    }

    if (Array.isArray(upload_tokens) && upload_tokens.some((t) => typeof t !== "string")) {
      return res.status(400).json({ success: false, error: "Invalid upload tokens" });
    }

    if (Array.isArray(upload_tokens) && new Set(upload_tokens).size !== upload_tokens.length) {
      return res.status(400).json({ success: false, error: "Duplicate upload tokens" });
    }

    if (remove_attachment_ids !== undefined && !Array.isArray(remove_attachment_ids)) {
      return res.status(400).json({ success: false, error: "Invalid remove_attachment_ids" });
    }

    if (Array.isArray(remove_attachment_ids) && remove_attachment_ids.some((id) => typeof id !== "string")) {
      return res.status(400).json({ success: false, error: "Invalid remove_attachment_ids" });
    }

    const hasTokens = Array.isArray(upload_tokens) && upload_tokens.length > 0;
    const hasRemovals = Array.isArray(remove_attachment_ids) && remove_attachment_ids.length > 0;
    const hasMessage = trimmedMessage !== undefined && trimmedMessage.length > 0;
    if (!hasMessage && !hasTokens && !hasRemovals) {
      return res.status(400).json({ success: false, error: "No changes provided" });
    }

    let updatedComment;
    try {
      updatedComment = await commentService.updateComment(
        ctx,
        commentId,
        hasMessage ? trimmedMessage : undefined,
        hasTokens ? upload_tokens : undefined,
        hasRemovals ? remove_attachment_ids : undefined,
      );
    } catch (err) {
      if (err instanceof Error && err.message === "One or more upload tokens are invalid or expired") {
        return res.status(400).json({ success: false, error: err.message });
      }
      return handleDomainError(err, res, "Failed to update comment");
    }

    res.json({ success: true, data: updatedComment });
  } catch (error) {
    console.error("Error updating comment:", error);
    res.status(500).json({ success: false, error: "Failed to update comment" });
  }
}
