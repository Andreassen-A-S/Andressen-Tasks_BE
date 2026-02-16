import type { Request, Response } from "express";
import { StatsService } from "../services/statService";
import { getParamId, requireUserId } from "../helper/helpers";
import { UserRole } from "../generated/prisma/client";

const statsService = new StatsService();

/**
 * These routes are protected by auth middleware.
 */

/**
 * GET /api/stats/overview
 * Get overview statistics (total tasks, completed today, pending, overdue)
 */
export async function getOverview(_req: Request, res: Response) {
  try {
    const stats = await statsService.getOverview();
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getOverview:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch overview stats" });
  }
}

/**
 * GET /api/stats/completion
 * Get completion rate statistics (today, week, month, avg days)
 */
export async function getCompletionRates(_req: Request, res: Response) {
  try {
    const stats = await statsService.getCompletionRates();
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getCompletionRates:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch completion rates" });
  }
}

/**
 * GET /api/stats/priority
 * Get priority breakdown statistics
 */
export async function getPriorityStats(_req: Request, res: Response) {
  try {
    const stats = await statsService.getPriorityStats();
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getPriorityStats:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch priority stats" });
  }
}

/**
 * GET /api/stats/status
 * Get status distribution statistics
 */
export async function getStatusStats(_req: Request, res: Response) {
  try {
    const stats = await statsService.getStatusStats();
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getStatusStats:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch status stats" });
  }
}

/**
 * GET /api/stats/top-performers?limit=5
 * Get top performing users
 */
export async function getTopPerformers(req: Request, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const stats = await statsService.getTopPerformers(limit);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getTopPerformers:", error);

    if (error instanceof Error && error.message.includes("must be between")) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch top performers" });
  }
}

/**
 * GET /api/stats/workload
 * Get workload distribution across users
 */
export async function getWorkloadDistribution(_req: Request, res: Response) {
  try {
    const stats = await statsService.getWorkloadDistribution();
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getWorkloadDistribution:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch workload distribution" });
  }
}

/**
 * GET /api/stats/recurring
 * Get recurring template statistics
 */
export async function getRecurringStats(_req: Request, res: Response) {
  try {
    const stats = await statsService.getRecurringStats();
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getRecurringStats:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch recurring stats" });
  }
}

/**
 * GET /api/stats/trends?days=7
 * Get task trends over time
 */
export async function getTaskTrends(req: Request, res: Response) {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const stats = await statsService.getTaskTrends(days);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getTaskTrends:", error);

    if (error instanceof Error && error.message.includes("must be between")) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch task trends" });
  }
}

/**
 * GET /api/stats/dashboard
 * Get all dashboard statistics in a single optimized call
 * This is the recommended endpoint for loading the full dashboard
 */
export async function getDashboardStats(_req: Request, res: Response) {
  try {
    const stats = await statsService.getAllStats();
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getDashboardStats:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch dashboard stats" });
  }
}

/**
 * GET /api/stats/user/:userId
 * Get statistics for a specific user
 */
export async function getUserStats(req: Request, res: Response) {
  const authUserId = requireUserId(req, res);
  if (!authUserId) return;

  try {
    const targetUserId = getParamId(req, "userId") || authUserId;

    const isAdmin = req.user && req.user.role === UserRole.ADMIN;

    // Users can only see their own stats unless they're admins
    if (targetUserId !== authUserId && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to view other users' stats",
      });
    }

    const stats = await statsService.getUserStats(targetUserId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getUserStats:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch user stats" });
  }
}

/**
 * GET /api/stats/me
 * Get statistics for the authenticated user
 */
export async function getMyStats(req: Request, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const stats = await statsService.getUserStats(userId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getMyStats:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch your stats" });
  }
}
