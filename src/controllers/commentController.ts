import { Request, Response } from "express";
import { TaskEventType, UserRole } from "../generated/prisma/client";
import * as commentRepo from "../repositories/commentRepository";
import * as attachmentRepo from "../repositories/attachmentRepository";
import * as storageService from "../services/storageService";

import { prisma } from "../db/prisma";
import * as taskEventRepo from "../repositories/taskEventRepository";
import * as userRepo from "../repositories/userRepository";
import { sendPushNotification } from "../services/notificationService";
import { getParamId, requireUserId } from "../helper/helpers";
import { CreateCommentRequest } from "../types/comment";

export async function listTaskComments(req: Request, res: Response) {
  try {
    const taskId = getParamId(req, "taskId");
    if (!taskId) return res.status(400).json({ success: false, error: "Missing taskId" });

    const userId = requireUserId(req, res);
    if (!userId) return;

    // Verify task exists and user has access
    const task = await prisma.task.findUnique({
      where: { task_id: taskId },
      include: {
        assignments: {
          where: { user_id: userId },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    // Check if user is creator, assigned to task, or admin
    const isCreator = task.created_by === userId;
    const isAssigned = task.assignments.length > 0;
    const isAdmin = req.user?.role === UserRole.ADMIN;

    if (!isCreator && !isAssigned && !isAdmin) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const comments = await commentRepo.getCommentsByTaskId(taskId);

    const commentsWithSignedUrls = await Promise.all(
      comments.map(async (comment) => ({
        ...comment,
        attachments: await Promise.all(
          comment.attachments.map(async (att) => ({
            ...att,
            url: await storageService.generateSignedReadUrl(att.gcs_path),
          })),
        ),
      })),
    );

    res.json({ success: true, data: commentsWithSignedUrls });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ success: false, error: "Failed to fetch comments" });
  }
}

export async function createComment(req: Request, res: Response) {
  try {
    const taskId = getParamId(req, "taskId");
    if (!taskId) return res.status(400).json({ success: false, error: "Missing taskId" });

    const { message, upload_tokens } = req.body as CreateCommentRequest;

    const userId = requireUserId(req, res);
    if (!userId) return;

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

    // Verify task exists and user has access (include all assignments for notification)
    const task = await prisma.task.findUnique({
      where: { task_id: taskId },
      include: {
        assignments: {
          include: {
            user: { select: { user_id: true, role: true, push_token: true } },
          },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    // Check if user is creator, assigned to task, or admin
    const isCreator = task.created_by === userId;
    const isAssigned = task.assignments.some((a) => a.user_id === userId);
    const isAdmin = req.user?.role === UserRole.ADMIN;

    if (!isCreator && !isAssigned && !isAdmin) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    let comment;
    try {
      comment = await commentRepo.createComment({
        task_id: taskId,
        user_id: userId,
        message: message?.trim() ?? "",
        upload_tokens: hasTokens ? upload_tokens : undefined,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "One or more upload tokens are invalid or expired") {
        return res.status(400).json({ success: false, error: err.message });
      }
      throw err;
    }

    // TaskEvent logic
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: comment.task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.COMMENT_CREATED,
      message: "Comment created",
      comment: { connect: { comment_id: comment.comment_id } },
      before_json: {},
      after_json: comment,
    });

    // Notify task assignees (skip the commenter and admins — admins get their own notification)
    for (const assignment of task.assignments) {
      if (assignment.user_id === userId) continue;
      if (assignment.user.role === UserRole.ADMIN) continue;
      if (!assignment.user.push_token) continue;
      void sendPushNotification(
        assignment.user.push_token,
        "Ny kommentar på din opgave",
        task.title,
        { taskId: task.task_id, screen: "comments" },
        assignment.user_id,
      );
    }

    // Notify admins (skip if the commenter is the admin)
    const admins = await userRepo.getAdminPushTokens();
    for (const { user_id: adminId, push_token } of admins) {
      if (adminId === userId) continue;
      void sendPushNotification(
        push_token,
        "Ny kommentar",
        task.title,
        { taskId: task.task_id, screen: "comments" },
        adminId,
      );
    }

    const commentWithSignedUrls = {
      ...comment,
      attachments: await Promise.all(
        comment.attachments.map(async (att) => ({
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

    const userId = requireUserId(req, res);
    if (!userId) return;

    const userRole = req.user?.role;

    const comment = await commentRepo.getCommentById(commentId);

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, error: "Comment not found" });
    }

    // Check if user owns the comment or is admin
    if (comment.user_id !== userId && userRole !== UserRole.ADMIN) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to delete this comment",
      });
    }

    // Delete GCS files best-effort — don't block comment deletion on storage failures
    const attachmentsToDelete = await attachmentRepo.getAttachmentsByCommentId(commentId);
    await Promise.all(
      attachmentsToDelete.map((a) =>
        storageService.deleteFile(a.gcs_path).catch((err) =>
          console.error("GCS delete failed for path:", a.gcs_path, err),
        ),
      ),
    );

    // Record event and delete comment — comment FK must still exist for the event
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: comment.task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.COMMENT_DELETED,
      message: "Comment deleted",
      comment: { connect: { comment_id: comment.comment_id } },
      before_json: comment,
      after_json: {},
    });

    await commentRepo.deleteComment(commentId);

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ success: false, error: "Failed to delete comment" });
  }
}

export async function updateComment(req: Request, res: Response) {
  try {
    const commentId = getParamId(req, "commentId");
    if (!commentId) return res.status(400).json({ success: false, error: "Missing commentId" });

    if (!req.body) {
      return res
        .status(400)
        .json({ success: false, error: "Missing request body" });
    }
    const { message } = req.body;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const userRole = req.user?.role;

    if (!message?.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Message is required" });
    }

    if (message.trim().length > 2000) {
      return res.status(400).json({
        success: false,
        error: "Message too long (max 2000 characters)",
      });
    }

    const comment = await commentRepo.getCommentById(commentId);

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, error: "Comment not found" });
    }

    // Check if user owns the comment or is admin
    if (comment.user_id !== userId && userRole !== UserRole.ADMIN) {
      return res
        .status(403)
        .json({ success: false, error: "Not authorized to edit this comment" });
    }

    const updatedComment = await commentRepo.updateComment(
      commentId,
      message.trim(),
    );

    // TaskEvent logic
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: comment.task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.COMMENT_UPDATED,
      message: "Comment updated",
      comment: { connect: { comment_id: comment.comment_id } },
      before_json: comment,
      after_json: updatedComment,
    });

    res.json({ success: true, data: updatedComment });
  } catch (error) {
    console.error("Error updating comment:", error);
    res.status(500).json({ success: false, error: "Failed to update comment" });
  }
}
