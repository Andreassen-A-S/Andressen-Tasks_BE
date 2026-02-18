import * as statsRepository from "../repositories/statRepository";

/**
 * Stats service - business logic layer for dashboard statistics
 */
export class StatsService {
  /**
   * Get overview statistics (total, completed today, pending, overdue)
   */
  async getOverview() {
    return await statsRepository.getOverviewStats();
  }

  /**
   * Get completion rate statistics
   */
  async getCompletionRates() {
    return await statsRepository.getCompletionRates();
  }

  /**
   * Get priority breakdown statistics
   */
  async getPriorityStats() {
    return await statsRepository.getPriorityStats();
  }

  /**
   * Get status distribution
   */
  async getStatusStats() {
    return await statsRepository.getStatusStats();
  }

  /**
   * Get top performing users
   */
  async getTopPerformers(limit: number = 5) {
    if (limit < 1 || limit > 20) {
      throw new Error("Limit must be between 1 and 20");
    }
    return await statsRepository.getTopPerformers(limit);
  }

  /**
   * Get workload distribution across users
   */
  async getWorkloadDistribution() {
    return await statsRepository.getWorkloadDistribution();
  }

  /**
   * Get recurring template statistics
   */
  async getRecurringStats() {
    return await statsRepository.getRecurringStats();
  }

  /**
   * Get task trends over time
   */
  async getTaskTrends(days: number = 7) {
    if (days < 1 || days > 90) {
      throw new Error("Days must be between 1 and 90");
    }
    return await statsRepository.getTaskTrends(days);
  }

  /**
   * Get all dashboard statistics in a single call
   * This is optimized for loading the entire dashboard at once
   */
  async getAllStats() {
    return await statsRepository.getAllStats();
  }

  /**
   * Get user-specific statistics
   */
  async getUserStats(userId: string) {
    // This could be extended with user-specific queries
    const workload = await statsRepository.getWorkloadDistribution();
    const userWorkload = workload.find((w) => w.user_id === userId);

    const overDueTasks = await statsRepository.getUserOverdueTasks(userId);

    if (!userWorkload) {
      return {
        userId,
        assigned_tasks: 0,
        completedTasks: 0,
        completionRate: 0,
        overDueTasks: 0,
      };
    }

    const completionRate =
      userWorkload.assigned_tasks > 0
        ? Math.round(
            (userWorkload.completed_tasks / userWorkload.assigned_tasks) * 100,
          )
        : 0;

    return {
      userId: userWorkload.user_id,
      name: userWorkload.name,
      email: userWorkload.email,
      assignedTasks: userWorkload.assigned_tasks,
      completedTasks: userWorkload.completed_tasks,
      overDueTasks: overDueTasks,
      completionRate,
    };
  }
}
