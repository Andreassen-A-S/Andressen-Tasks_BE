import { Router } from "express";
import * as templateController from "../controllers/templateController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createTemplateSchema, updateTemplateSchema } from "../schemas/templateSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";
import { requireOrgAccess } from "../middleware/orgAccess";

const router = Router();

router.use(authenticateToken, asyncHandler(requireOrgAccess));

// GET /api/recurring-templates - List all templates
router.get("/", asyncHandler(templateController.listTemplates));

// List all active templates
router.get(
  "/active",
  asyncHandler(templateController.listActiveTemplates),
);

// Create new template
router.post("/", validate(createTemplateSchema), asyncHandler(templateController.createTemplate));

// Get single template
router.get("/:id", asyncHandler(templateController.getTemplate));

// Update template
router.patch("/:id", validate(updateTemplateSchema), asyncHandler(templateController.updateTemplate));

// Delete template
router.delete("/:id", asyncHandler(templateController.deleteTemplate));

// Deactivate template (stop generating instances)
router.post(
  "/:id/deactivate",
  asyncHandler(templateController.deactivateTemplate),
);

// Reactivate template (resume generating instances)
router.post(
  "/:id/reactivate",
  asyncHandler(templateController.reactivateTemplate),
);

// Get all instances for a template
router.get(
  "/:id/instances",
  asyncHandler(templateController.getTemplateInstances),
);

export default router;
