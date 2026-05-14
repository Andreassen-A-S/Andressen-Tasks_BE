import { Router } from "express";
import * as attachmentController from "../controllers/attachmentController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { prepareAttachmentsSchema } from "../schemas/attachmentSchemas";

const router = Router();

// POST /api/attachments/prepare — create pending attachment records and get signed upload URLs
router.post("/prepare", authenticateToken, validate(prepareAttachmentsSchema), attachmentController.prepareAttachments);

// GET /api/attachments/task/:taskId — all confirmed attachments for a task
router.get("/task/:taskId", authenticateToken, attachmentController.getTaskAttachments);

// DELETE /api/attachments/:attachmentId — delete from GCS + DB
router.delete("/:attachmentId", authenticateToken, attachmentController.deleteAttachment);

export default router;
