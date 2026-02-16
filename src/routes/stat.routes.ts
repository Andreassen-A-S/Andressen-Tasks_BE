import { Router } from "express";
import * as statsController from "../controllers/statController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

/**
 * Stats Routes
 * All routes are protected by auth middleware (applied in main app)
 */

// Get all dashboard stats in one call (RECOMMENDED)
router.get("/dashboard", authenticateToken, statsController.getDashboardStats);

// Individual stat endpoints
router.get("/overview", authenticateToken, statsController.getOverview);
router.get(
  "/completion",
  authenticateToken,
  statsController.getCompletionRates,
);
router.get("/priority", authenticateToken, statsController.getPriorityStats);
router.get("/status", authenticateToken, statsController.getStatusStats);
router.get(
  "/top-performers",
  authenticateToken,
  statsController.getTopPerformers,
);
router.get(
  "/workload",
  authenticateToken,
  statsController.getWorkloadDistribution,
);
router.get("/recurring", authenticateToken, statsController.getRecurringStats);
router.get("/trends", authenticateToken, statsController.getTaskTrends);

// User-specific stats
router.get("/me", authenticateToken, statsController.getMyStats);
router.get("/user/:userId", authenticateToken, statsController.getUserStats);

export default router;
