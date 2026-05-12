import { Router } from "express";
import * as orgController from "../controllers/organizationController";
import { authenticateToken, requireSuperAdmin } from "../middleware/auth";

const router = Router();

router.use(authenticateToken, requireSuperAdmin);

router.get("/", orgController.listOrganizations);
router.post("/", orgController.createOrganization);
router.get("/:id", orgController.getOrganization);
router.patch("/:id", orgController.updateOrganization);
router.delete("/:id", orgController.deleteOrganization);

export default router;
