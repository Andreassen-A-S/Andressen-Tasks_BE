import { Router } from "express";
import * as orgController from "../controllers/organizationController";
import { authenticateToken, requireSuperAdmin, requireAdminOrSuperAdmin } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createOrganizationSchema, updateOrganizationSchema, prepareOrgLogoSchema } from "../schemas/organizationSchemas";

const router = Router();

router.use(authenticateToken);

// Super admin only
router.get("/", requireSuperAdmin, orgController.listOrganizations);
router.post("/", requireSuperAdmin, validate(createOrganizationSchema), orgController.createOrganization);
router.delete("/:id", requireSuperAdmin, orgController.deleteOrganization);

// Admins can manage their own org; super admins can manage any
router.get("/:id", requireAdminOrSuperAdmin, orgController.getOrganization);
router.patch("/:id", requireAdminOrSuperAdmin, validate(updateOrganizationSchema), orgController.updateOrganization);
router.post("/:id/logo/prepare", requireAdminOrSuperAdmin, validate(prepareOrgLogoSchema), orgController.prepareOrgLogo);

export default router;
