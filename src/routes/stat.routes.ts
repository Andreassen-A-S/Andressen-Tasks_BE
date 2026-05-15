import { Router } from "express";
import * as statsController from "../controllers/statController";
import { authenticateToken } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorMiddleware";

const router = Router();

/**
 * Stats Routes
 * All routes are protected by auth middleware (applied in main app)
 */

// Get all dashboard stats in one call (RECOMMENDED)
router.get("/dashboard", authenticateToken, asyncHandler(statsController.getDashboardStats));

// Individual stat endpoints
router.get("/overview", authenticateToken, asyncHandler(statsController.getOverview));
router.get(
  "/completion",
  authenticateToken,
  asyncHandler(statsController.getCompletionRates),
);
router.get("/priority", authenticateToken, asyncHandler(statsController.getPriorityStats));
router.get("/status", authenticateToken, asyncHandler(statsController.getStatusStats));
router.get(
  "/top-performers",
  authenticateToken,
  asyncHandler(statsController.getTopPerformers),
);
router.get(
  "/workload",
  authenticateToken,
  asyncHandler(statsController.getWorkloadDistribution),
);
router.get("/recurring", authenticateToken, asyncHandler(statsController.getRecurringStats));
router.get("/trends", authenticateToken, asyncHandler(statsController.getTaskTrends));

// User-specific stats
router.get("/me", authenticateToken, asyncHandler(statsController.getMyStats));
router.get("/user/:userId", authenticateToken, asyncHandler(statsController.getUserStats));

export default router;
