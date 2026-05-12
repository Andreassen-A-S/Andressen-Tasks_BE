import * as statsRepository from "../repositories/statRepository";

/**
 * Stats service - business logic layer for dashboard statistics
 */
export class StatsService {
  /**
   * Get overview statistics (total, completed today, pending, overdue)
   */
  async getOverview(orgId: string | null = null) {
    return await statsRepository.getOverviewStats(orgId);
  }

  /**
   * Get completion rate statistics
   */
  async getCompletionRates(orgId: string | null = null) {
    return await statsRepository.getCompletionRates(orgId);
  }

  /**
   * Get priority breakdown statistics
   */
  async getPriorityStats(orgId: string | null = null) {
    return await statsRepository.getPriorityStats(orgId);
  }

  /**
   * Get status distribution
   */
  async getStatusStats(orgId: string | null = null) {
    return await statsRepository.getStatusStats(orgId);
  }

  /**
   * Get top performing users
   */
  async getTopPerformers(limit: number = 5, orgId: string | null = null) {
    if (limit < 1 || limit > 20) {
      throw new Error("Limit must be between 1 and 20");
    }
    return await statsRepository.getTopPerformers(limit, orgId);
  }

  /**
   * Get workload distribution across users
   */
  async getWorkloadDistribution(orgId: string | null = null) {
    return await statsRepository.getWorkloadDistribution(orgId);
  }

  /**
   * Get recurring template statistics
   */
  async getRecurringStats(orgId: string | null = null) {
    return await statsRepository.getRecurringStats(orgId);
  }

  /**
   * Get task trends over time
   */
  async getTaskTrends(days: number = 7, orgId: string | null = null) {
    if (days < 1 || days > 90) {
      throw new Error("Days must be between 1 and 90");
    }
    return await statsRepository.getTaskTrends(days, orgId);
  }

  /**
   * Get all dashboard statistics in a single call
   * This is optimized for loading the entire dashboard at once
   */
  async getAllStats(orgId: string | null = null) {
    return await statsRepository.getAllStats(orgId);
  }

  /**
   * Get all dashboard statistics for a rolling window of the last N days (1–365).
   * Includes overview, completion rates, trends, project stats, and leaderboard.
   */
  async getStatsForWindow(days: number = 30, orgId: string | null = null) {
    if (!Number.isFinite(days) || !Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error("Days must be between 1 and 365");
    }
    return await statsRepository.getStatsForWindow(days, orgId);
  }

  /**
   * Get user-specific statistics
   */
  async getUserStats(userId: string, orgId: string | null = null) {
    // This could be extended with user-specific queries
    const [workload, overDueTasks, weeklyStats] = await Promise.all([
      statsRepository.getWorkloadDistribution(orgId),
      statsRepository.getUserOverdueTasks(userId),
      statsRepository.getUserWeeklyStats(userId),
    ]);

    const userWorkload = workload.find((w) => w.user_id === userId);

    if (!userWorkload) {
      return {
        user_id: userId,
        assigned_tasks: 0,
        completed_tasks: 0,
        completion_rate: 0,
        overdue_tasks: 0,
        weekly_stats: weeklyStats,
      };
    }

    const completionRate =
      userWorkload.assigned_tasks > 0
        ? Math.round(
            (userWorkload.completed_tasks / userWorkload.assigned_tasks) * 100,
          )
        : 0;

    return {
      user_id: userWorkload.user_id,
      name: userWorkload.name,
      email: userWorkload.email,
      assigned_tasks: userWorkload.assigned_tasks,
      completed_tasks: userWorkload.completed_tasks,
      overdue_tasks: overDueTasks,
      completion_rate: completionRate,
      weekly_stats: weeklyStats,
    };
  }
}
