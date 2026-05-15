import { Router } from "express";
import * as attachmentController from "../controllers/attachmentController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { prepareAttachmentsSchema } from "../schemas/attachmentSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";

const router = Router();

// POST /api/attachments/prepare — create pending attachment records and get signed upload URLs
router.post("/prepare", authenticateToken, validate(prepareAttachmentsSchema), asyncHandler(attachmentController.prepareAttachments));

// GET /api/attachments/task/:taskId — all confirmed attachments for a task
router.get("/task/:taskId", authenticateToken, asyncHandler(attachmentController.getTaskAttachments));

// DELETE /api/attachments/:attachmentId — delete from GCS + DB
router.delete("/:attachmentId", authenticateToken, asyncHandler(attachmentController.deleteAttachment));

export default router;
