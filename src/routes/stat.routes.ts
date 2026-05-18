import { Router } from "express";
import * as statsController from "../controllers/statController";
import { authenticateToken } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorMiddleware";
import { requireOrgAccess } from "../middleware/orgAccess";

const router = Router();

/**
 * Stats Routes
 * All routes are protected by auth middleware (applied in main app)
 */

router.use(authenticateToken, asyncHandler(requireOrgAccess));

// Get all dashboard stats in one call (RECOMMENDED)
router.get("/dashboard", asyncHandler(statsController.getDashboardStats));

// Individual stat endpoints
router.get("/overview", asyncHandler(statsController.getOverview));
router.get(
  "/completion",
  asyncHandler(statsController.getCompletionRates),
);
router.get("/priority", asyncHandler(statsController.getPriorityStats));
router.get("/status", asyncHandler(statsController.getStatusStats));
router.get(
  "/top-performers",
  asyncHandler(statsController.getTopPerformers),
);
router.get(
  "/workload",
  asyncHandler(statsController.getWorkloadDistribution),
);
router.get("/recurring", asyncHandler(statsController.getRecurringStats));
router.get("/trends", asyncHandler(statsController.getTaskTrends));

// User-specific stats
router.get("/me", asyncHandler(statsController.getMyStats));
router.get("/user/:userId", asyncHandler(statsController.getUserStats));

export default router;
