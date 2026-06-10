import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import { requireOrgAccess } from "../middleware/orgAccess";
import { asyncHandler } from "../middleware/errorMiddleware";
import * as dashboardController from "../controllers/dashboardController";

const router = Router();

router.use(authenticateToken, asyncHandler(requireOrgAccess));

router.get("/", asyncHandler(dashboardController.getDashboard));

export default router;
