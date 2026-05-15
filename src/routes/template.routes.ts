import { Router } from "express";
import * as templateController from "../controllers/templateController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createTemplateSchema, updateTemplateSchema } from "../schemas/templateSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";

const router = Router();

// GET /api/recurring-templates - List all templates
router.get("/", authenticateToken, asyncHandler(templateController.listTemplates));

// List all active templates
router.get(
  "/active",
  authenticateToken,
  asyncHandler(templateController.listActiveTemplates),
);

// Create new template
router.post("/", authenticateToken, validate(createTemplateSchema), asyncHandler(templateController.createTemplate));

// Get single template
router.get("/:id", authenticateToken, asyncHandler(templateController.getTemplate));

// Update template
router.patch("/:id", authenticateToken, validate(updateTemplateSchema), asyncHandler(templateController.updateTemplate));

// Delete template
router.delete("/:id", authenticateToken, asyncHandler(templateController.deleteTemplate));

// Deactivate template (stop generating instances)
router.post(
  "/:id/deactivate",
  authenticateToken,
  asyncHandler(templateController.deactivateTemplate),
);

// Reactivate template (resume generating instances)
router.post(
  "/:id/reactivate",
  authenticateToken,
  asyncHandler(templateController.reactivateTemplate),
);

// Get all instances for a template
router.get(
  "/:id/instances",
  authenticateToken,
  asyncHandler(templateController.getTemplateInstances),
);

export default router;
