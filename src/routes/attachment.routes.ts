import { Router } from "express";
import * as attachmentController from "../controllers/attachmentController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// POST /api/attachments/prepare — create pending attachment records and get signed upload URLs
router.post("/prepare", authenticateToken, attachmentController.prepareAttachments);

// GET /api/attachments/task/:taskId — all image attachments for the Photos tab
router.get("/task/:taskId", authenticateToken, attachmentController.getTaskImages);

// DELETE /api/attachments/:attachmentId — delete from GCS + DB
router.delete("/:attachmentId", authenticateToken, attachmentController.deleteAttachment);

export default router;
