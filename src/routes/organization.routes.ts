import { Router } from "express";
import * as orgController from "../controllers/organizationController";
import { authenticateToken, requireSuperAdmin, requireAdminOrSuperAdmin } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createOrganizationSchema, updateOrganizationSchema, prepareOrgLogoSchema } from "../schemas/organizationSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";

const router = Router();

router.use(authenticateToken);

// Super admin only
router.get("/", requireSuperAdmin, asyncHandler(orgController.listOrganizations));
router.post("/", requireSuperAdmin, validate(createOrganizationSchema), asyncHandler(orgController.createOrganization));
router.delete("/:id", requireSuperAdmin, asyncHandler(orgController.deleteOrganization));

// Admins can manage their own org; super admins can manage any
router.get("/:id", requireAdminOrSuperAdmin, asyncHandler(orgController.getOrganization));
router.patch("/:id", requireAdminOrSuperAdmin, validate(updateOrganizationSchema), asyncHandler(orgController.updateOrganization));
router.post("/:id/logo/prepare", requireAdminOrSuperAdmin, validate(prepareOrgLogoSchema), asyncHandler(orgController.prepareOrgLogo));

export default router;
