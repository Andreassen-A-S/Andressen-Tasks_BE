import { Router } from "express";
import * as commentController from "../controllers/commentController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createCommentSchema, updateCommentSchema } from "../schemas/commentSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";

const router = Router();

// GET /api/comments/task/:taskId - List comments for a task
router.get(
  "/task/:taskId",
  authenticateToken,
  asyncHandler(commentController.listTaskComments),
);

// POST /api/comments/task/:taskId - Create a comment
router.post(
  "/task/:taskId",
  authenticateToken,
  validate(createCommentSchema),
  asyncHandler(commentController.createComment),
);

// DELETE /api/comments/:commentId - Delete a comment
router.delete(
  "/:commentId",
  authenticateToken,
  asyncHandler(commentController.deleteComment),
);

// PATCH /api/comments/:commentId - Edit a comment
router.patch("/:commentId", authenticateToken, validate(updateCommentSchema), asyncHandler(commentController.updateComment));

export default router;
