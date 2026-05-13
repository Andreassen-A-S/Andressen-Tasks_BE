import type { Request, Response } from "express";
import { StatsService } from "../services/statService";
import { getParamId } from "../helper/helpers";
import { UserRole } from "../generated/prisma/client";
import { getRequestContext } from "../types/requestContext";

const statsService = new StatsService();

export async function getOverview(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  try {
    const stats = await statsService.getOverview(ctx.effectiveOrgId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getOverview:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch overview stats" });
  }
}

export async function getCompletionRates(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  try {
    const stats = await statsService.getCompletionRates(ctx.effectiveOrgId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getCompletionRates:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch completion rates" });
  }
}

export async function getPriorityStats(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  try {
    const stats = await statsService.getPriorityStats(ctx.effectiveOrgId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getPriorityStats:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch priority stats" });
  }
}

export async function getStatusStats(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  try {
    const stats = await statsService.getStatusStats(ctx.effectiveOrgId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getStatusStats:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch status stats" });
  }
}

export async function getTopPerformers(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const stats = await statsService.getTopPerformers(limit, ctx.effectiveOrgId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getTopPerformers:", error);
    if (error instanceof Error && error.message.includes("must be between")) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: "Failed to fetch top performers" });
  }
}

export async function getWorkloadDistribution(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  try {
    const stats = await statsService.getWorkloadDistribution(ctx.effectiveOrgId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getWorkloadDistribution:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch workload distribution" });
  }
}

export async function getRecurringStats(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  try {
    const stats = await statsService.getRecurringStats(ctx.effectiveOrgId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getRecurringStats:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch recurring stats" });
  }
}

export async function getTaskTrends(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  try {
    const days = parseInt(req.query.days as string) || 7;
    const stats = await statsService.getTaskTrends(days, ctx.effectiveOrgId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getTaskTrends:", error);
    if (error instanceof Error && error.message.includes("must be between")) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: "Failed to fetch task trends" });
  }
}

export async function getDashboardStats(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  try {
    const raw = parseInt(req.query.days as string, 10);
    const days = Number.isNaN(raw) ? 30 : raw;
    const stats = await statsService.getStatsForWindow(days, ctx.effectiveOrgId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getDashboardStats:", error);
    if (error instanceof Error && error.message.includes("must be between")) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: "Failed to fetch dashboard stats" });
  }
}

export async function getUserStats(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  try {
    const targetUserId = getParamId(req, "userId") || ctx.actorUserId;
    // Users can only view their own stats; admins and super-admins can view any user's stats.
    const isPrivileged = ctx.actorRole === UserRole.ADMIN || ctx.isSuperAdmin;
    if (targetUserId !== ctx.actorUserId && !isPrivileged) {
      return res.status(403).json({ success: false, error: "Not authorized to view other users' stats" });
    }

    const stats = await statsService.getUserStats(targetUserId, ctx.effectiveOrgId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getUserStats:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch user stats" });
  }
}

export async function getMyStats(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  try {
    const stats = await statsService.getUserStats(ctx.actorUserId, ctx.effectiveOrgId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Error in getMyStats:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch your stats" });
  }
}
