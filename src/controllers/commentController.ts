import { Request, Response } from "express";
import { PrismaClient, UserRole } from "../generated/prisma/client";

const prisma = new PrismaClient();

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

    const comments = await prisma.taskComment.findMany({
      where: { task_id: taskId },
      include: {
        author: {
          select: {
            user_id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { created_at: "asc" },
    });

    res.json({ success: true, data: comments });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ success: false, error: "Failed to fetch comments" });
  }
}

export async function createComment(req: Request, res: Response) {
  try {
    const taskId = req.params.taskId as string;
    const { message } = req.body;
    const userId = req.user?.user_id;

    if (!userId) {
      return res
        .status(401)
        .json({
          success: false,
          error: "Unauthorized: user not found in token",
        });
    }

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

    const comment = await prisma.taskComment.create({
      data: {
        task_id: taskId,
        user_id: userId!,
        message: message.trim(),
      },
      include: {
        author: {
          select: {
            user_id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    res.status(201).json({ success: true, data: comment });
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

    const comment = await prisma.taskComment.findUnique({
      where: { comment_id: commentId },
    });

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, error: "Comment not found" });
    }

    // Check if user owns the comment or is admin
    if (comment.user_id !== userId && userRole !== "ADMIN") {
      return res.status(403).json({
        success: false,
        error: "Not authorized to delete this comment",
      });
    }

    await prisma.taskComment.delete({
      where: { comment_id: commentId },
    });

    res.status(204).json({ success: true });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ success: false, error: "Failed to delete comment" });
  }
}

export async function updateComment(req: Request, res: Response) {
  try {
    const commentId = req.params.commentId as string;
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

    const comment = await prisma.taskComment.findUnique({
      where: { comment_id: commentId },
    });

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, error: "Comment not found" });
    }

    // Check if user owns the comment or is admin
    if (comment.user_id !== userId && userRole !== "ADMIN") {
      return res
        .status(403)
        .json({ success: false, error: "Not authorized to edit this comment" });
    }

    const updatedComment = await prisma.taskComment.update({
      where: { comment_id: commentId },
      data: { message: message.trim() },
      include: {
        author: {
          select: {
            user_id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    res.json({ success: true, data: updatedComment });
  } catch (error) {
    console.error("Error updating comment:", error);
    res.status(500).json({ success: false, error: "Failed to update comment" });
  }
}
