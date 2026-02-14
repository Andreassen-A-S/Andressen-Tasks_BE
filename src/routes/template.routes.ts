import { Router } from "express";
import * as templateController from "../controllers/templateController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// GET /api/recurring-templates - List all templates
router.get("/", authenticateToken, templateController.listTemplates);

// List all active templates
router.get(
  "/active",
  authenticateToken,
  templateController.listActiveTemplates,
);

// Create new template
router.post("/", authenticateToken, templateController.createTemplate);

// Get single template
router.get("/:id", authenticateToken, templateController.getTemplate);

// Update template
router.patch("/:id", authenticateToken, templateController.updateTemplate);

// Delete template
router.delete("/:id", authenticateToken, templateController.deleteTemplate);

// Deactivate template (stop generating instances)
router.post(
  "/:id/deactivate",
  authenticateToken,
  templateController.deactivateTemplate,
);

// Reactivate template (resume generating instances)
router.post(
  "/:id/reactivate",
  authenticateToken,
  templateController.reactivateTemplate,
);

// Get all instances for a template
router.get(
  "/:id/instances",
  authenticateToken,
  templateController.getTemplateInstances,
);

export default router;
