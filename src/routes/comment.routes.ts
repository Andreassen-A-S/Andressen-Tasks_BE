import { Router } from "express";
import * as commentController from "../controllers/commentController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// GET /api/comments/task/:taskId - List comments for a task
router.get(
  "/task/:taskId",
  authenticateToken,
  commentController.listTaskComments,
);

// POST /api/comments/task/:taskId - Create a comment
router.post(
  "/task/:taskId",
  authenticateToken,
  commentController.createComment,
);

// DELETE /api/comments/:commentId - Delete a comment
router.delete(
  "/:commentId",
  authenticateToken,
  commentController.deleteComment,
);

// PATCH /api/comments/:commentId - Edit a comment
router.patch("/:commentId", authenticateToken, commentController.updateComment);

export default router;
