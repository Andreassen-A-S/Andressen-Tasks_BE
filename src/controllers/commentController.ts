import { Request, Response } from "express";
import { TaskEventType, UserRole } from "../generated/prisma/client";
import * as commentRepo from "../repositories/commentRepository";
import * as attachmentRepo from "../repositories/attachmentRepository";
import * as storageService from "../services/storageService";
import { prisma } from "../db/prisma";
import * as taskEventRepo from "../repositories/taskEventRepository";
import * as userRepo from "../repositories/userRepository";
import { sendPushNotification } from "../services/notificationService";

export async function listTaskComments(req: Request, res: Response) {
  try {
    const taskId = req.params.taskId as string;

    // Verify task exists and user has access
    const task = await prisma.task.findUnique({
      where: { task_id: taskId },
      include: {
        assignments: {
          where: { user_id: req.user?.user_id },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    // Check if user is creator, assigned to task, or admin
    const isCreator = task.created_by === req.user?.user_id;
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
            public_url: await storageService.generateSignedReadUrl(att.gcs_path),
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
    const taskId = req.params.taskId as string;
    const { message, attachments } = req.body as {
      message?: string;
      attachments?: commentRepo.AttachmentInput[];
    };
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: user not found in token",
      });
    }

    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    if (!message?.trim() && !hasAttachments) {
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

    const comment = await commentRepo.createComment({
      task_id: taskId,
      user_id: userId,
      message: message?.trim() ?? "",
      attachments: hasAttachments ? attachments : undefined,
    });

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
          public_url: await storageService.generateSignedReadUrl(att.gcs_path),
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
    const commentId = req.params.commentId as string;
    const userId = req.user?.user_id;
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

    // TaskEvent logic before delete — comment FK must still exist
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: comment.task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.COMMENT_DELETED,
      message: "Comment deleted",
      comment: { connect: { comment_id: comment.comment_id } },
      before_json: comment,
      after_json: {},
    });

    // Delete GCS files and DB record
    const attachmentsToDelete = await attachmentRepo.getAttachmentsByCommentId(commentId);
    for (const attachment of attachmentsToDelete) {
      void storageService.deleteFile(attachment.gcs_path);
    }

    await commentRepo.deleteComment(commentId);

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ success: false, error: "Failed to delete comment" });
  }
}

export async function updateComment(req: Request, res: Response) {
  try {
    const commentId = req.params.commentId as string;
    if (!req.body) {
      return res
        .status(400)
        .json({ success: false, error: "Missing request body" });
    }
    const { message } = req.body;
    const userId = req.user?.user_id;
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
