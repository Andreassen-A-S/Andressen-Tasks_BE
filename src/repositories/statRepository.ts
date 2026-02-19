import { prisma } from "../db/prisma";
import {
  TaskStatus,
  TaskPriority,
  type Prisma,
} from "../generated/prisma/client";
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  subDays,
  addDays,
} from "date-fns";

/**
 * Stats repository with transaction support
 * All methods accept an optional transaction client
 */

type TransactionClient = Prisma.TransactionClient;
type PrismaClient = typeof prisma | TransactionClient;

/**
 * Get overview statistics
 */
export async function getOverviewStats(client: PrismaClient = prisma) {
  const now = new Date();
  const todayStart = startOfDay(now);

  const [totalTasks, completedToday, pendingTasks, overdueTasks] =
    await Promise.all([
      // Total tasks count
      client.task.count(),

      // Completed today
      client.task.count({
        where: {
          status: TaskStatus.DONE,
          updated_at: { gte: todayStart },
        },
      }),

      // Pending tasks
      client.task.count({
        where: {
          status: TaskStatus.PENDING,
        },
      }),

      // Overdue tasks (not completed, past deadline)
      client.task.count({
        where: {
          deadline: { lt: now },
          status: { not: TaskStatus.DONE },
        },
      }),
    ]);

  return {
    total_tasks: totalTasks,
    completed_today: completedToday,
    pending_tasks: pendingTasks,
    overdue_tasks: overdueTasks,
  };
}

/**
 * Get completion rate statistics for different time periods
 */
export async function getCompletionRates(client: PrismaClient = prisma) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const monthStart = startOfMonth(now);

  const [todayStats, weekStats, monthStats] = await Promise.all([
    // Today
    client.task.groupBy({
      by: ["status"],
      where: {
        created_at: { gte: todayStart },
      },
      _count: true,
    }),

    // This week
    client.task.groupBy({
      by: ["status"],
      where: {
        created_at: { gte: weekStart },
      },
      _count: true,
    }),

    // This month
    client.task.groupBy({
      by: ["status"],
      where: {
        created_at: { gte: monthStart },
      },
      _count: true,
    }),
  ]);

  const calculateRate = (stats: any[]) => {
    const total = stats.reduce((sum, s) => sum + s._count, 0);
    const completed =
      stats.find((s) => s.status === TaskStatus.DONE)?._count || 0;
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  // Calculate average completion time
  const completedTasks = await client.task.findMany({
    where: {
      status: TaskStatus.DONE,
      created_at: { gte: monthStart },
    },
    select: {
      created_at: true,
      completed_at: true,
    },
  });

  let avgCompletionDays = 0;
  if (completedTasks.length > 0) {
    const totalDays = completedTasks.reduce((sum, task) => {
      if (!task.completed_at) return sum;
      const days = Math.ceil(
        (task.completed_at.getTime() - task.created_at.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      return sum + days;
    }, 0);
    avgCompletionDays = Math.round(totalDays / completedTasks.length);
  }

  return {
    today_rate: calculateRate(todayStats),
    week_rate: calculateRate(weekStats),
    month_rate: calculateRate(monthStats),
    avg_completion_days: avgCompletionDays,
  };
}

/**
 * Get priority breakdown statistics
 */
export async function getPriorityStats(client: PrismaClient = prisma) {
  const now = new Date();

  const priorityGroups = await client.task.groupBy({
    by: ["priority", "status"],
    _count: true,
  });

  const overdueCounts = await client.task.groupBy({
    by: ["priority"],
    where: {
      deadline: { lt: now },
      status: { not: TaskStatus.DONE },
    },
    _count: true,
  });

  const priorities = [TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW];

  return priorities.reduce(
    (acc, priority) => {
      const total = priorityGroups
        .filter((g) => g.priority === priority)
        .reduce((sum, g) => sum + g._count, 0);

      const completed =
        priorityGroups.find(
          (g) => g.priority === priority && g.status === TaskStatus.DONE,
        )?._count || 0;

      const overdue =
        overdueCounts.find((g) => g.priority === priority)?._count || 0;

      acc[priority.toLowerCase()] = {
        total,
        completed,
        overdue,
      };

      return acc;
    },
    {} as Record<string, { total: number; completed: number; overdue: number }>,
  );
}

/**
 * Get status distribution
 */
export async function getStatusStats(client: PrismaClient = prisma) {
  const statusGroups = await client.task.groupBy({
    by: ["status"],
    _count: true,
  });

  return {
    pending:
      statusGroups.find((s) => s.status === TaskStatus.PENDING)?._count || 0,
    in_progress:
      statusGroups.find((s) => s.status === TaskStatus.IN_PROGRESS)?._count ||
      0,
    completed:
      statusGroups.find((s) => s.status === TaskStatus.DONE)?._count || 0,
    rejected:
      statusGroups.find((s) => s.status === TaskStatus.REJECTED)?._count || 0,
    archived:
      statusGroups.find((s) => s.status === TaskStatus.ARCHIVED)?._count || 0,
  };
}

/**
 * Get top performers (users with most completed tasks)
 */
export async function getTopPerformers(
  limit: number = 5,
  client: PrismaClient = prisma,
) {
  const monthStart = startOfMonth(new Date());

  const performers = await client.task.groupBy({
    by: ["completed_by"],
    where: {
      status: TaskStatus.DONE,
      completed_by: { not: null },
      completed_at: { gte: monthStart },
    },
    _count: { task_id: true },
    _sum: { current_quantity: true },
    orderBy: { _count: { task_id: "desc" } },
    take: limit,
  });

  // Fetch user details
  const userIds = performers.map((p) => p.completed_by!);
  const users = await client.user.findMany({
    where: { user_id: { in: userIds } },
    select: { user_id: true, name: true, email: true },
  });

  return performers.map((p) => {
    const user = users.find((u) => u.user_id === p.completed_by!);
    return {
      user_id: p.completed_by,
      name: user?.name || "Unknown",
      email: user?.email || "",
      completed_count: p._count.task_id,
      total_quantity: p._sum.current_quantity || 0,
    };
  });
}

/**
 * Get workload distribution (assigned tasks per user)
 */
export async function getWorkloadDistribution(client: PrismaClient = prisma) {
  const assignments = await client.taskAssignment.groupBy({
    by: ["user_id"],
    _count: { task_id: true },
  });

  // Get completion counts per user
  const completions = await client.task.groupBy({
    by: ["completed_by"],
    where: {
      status: TaskStatus.DONE,
      completed_by: { not: null },
    },
    _count: { task_id: true },
  });

  // Fetch user details
  const userIds = assignments.map((a) => a.user_id);
  const users = await client.user.findMany({
    where: { user_id: { in: userIds } },
    select: { user_id: true, name: true, email: true },
  });

  return assignments.map((a) => {
    const user = users.find((u) => u.user_id === a.user_id);
    const completedCount =
      completions.find((c) => c.completed_by === a.user_id)?._count.task_id ||
      0;

    return {
      user_id: a.user_id,
      name: user?.name || "Unknown",
      email: user?.email || "",
      assigned_tasks: a._count.task_id,
      completed_tasks: completedCount,
    };
  });
}

/**
 * Get recurring template statistics
 */
export async function getRecurringStats(client: PrismaClient = prisma) {
  const now = new Date();
  const nextWeek = addDays(now, 7);

  const [
    activeTemplates,
    upcomingInstances,
    totalInstances,
    completedInstances,
  ] = await Promise.all([
    // Active templates count
    client.recurringTaskTemplate.count({
      where: { is_active: true },
    }),

    // Upcoming instances (next 7 days)
    client.task.count({
      where: {
        recurring_template_id: { not: null },
        occurrence_date: {
          gte: now,
          lte: nextWeek,
        },
        status: TaskStatus.PENDING,
      },
    }),

    // Total recurring instances
    client.task.count({
      where: {
        recurring_template_id: { not: null },
      },
    }),

    // Completed recurring instances
    client.task.count({
      where: {
        recurring_template_id: { not: null },
        status: TaskStatus.DONE,
      },
    }),
  ]);

  const completionRate =
    totalInstances > 0
      ? Math.round((completedInstances / totalInstances) * 100)
      : 0;

  return {
    active_templates: activeTemplates,
    upcoming_instances: upcomingInstances,
    completion_rate: completionRate,
  };
}

/**
 * Get task trends over the last N days
 */
export async function getTaskTrends(
  days: number = 7,
  client: PrismaClient = prisma,
) {
  const dates = Array.from({ length: days }, (_, i) => {
    return startOfDay(subDays(new Date(), days - 1 - i));
  });

  const trends = await Promise.all(
    dates.map(async (date) => {
      const nextDay = addDays(date, 1);

      const [created, completed] = await Promise.all([
        client.task.count({
          where: {
            created_at: { gte: date, lt: nextDay },
          },
        }),
        client.task.count({
          where: {
            status: TaskStatus.DONE,
            completed_at: { gte: date, lt: nextDay },
          },
        }),
      ]);

      return {
        date: date.toISOString().split("T")[0],
        created,
        completed,
      };
    }),
  );

  return trends;
}

/**
 * Get user overdue tasks count
 */
export async function getUserOverdueTasks(
  userId: string,
  client: PrismaClient = prisma,
) {
  const now = new Date();
  return client.task.count({
    where: {
      deadline: { lt: now },
      status: {
        notIn: [TaskStatus.DONE, TaskStatus.ARCHIVED, TaskStatus.REJECTED],
      },
      assignments: {
        some: { user_id: userId },
      },
    },
  });
}

/**
 * Get user weekly task stats (current week, Monday start)
 */
export async function getUserWeeklyStats(
  userId: string,
  client: PrismaClient = prisma,
) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);

  // planned tasks = assignments where task is scheduled this week
  const plannedWhere = {
    user_id: userId,
    task: {
      scheduled_date: { gte: weekStart, lt: weekEnd },
    },
  } as const;

  const [plannedTasksThisWeek, plannedTasksCompleted] = await Promise.all([
    client.taskAssignment.count({
      where: plannedWhere,
    }),

    // planned + completed (credit)
    client.taskAssignment.count({
      where: {
        ...plannedWhere,
        task: {
          scheduled_date: { gte: weekStart, lt: weekEnd },
          status: TaskStatus.DONE,
          completed_by: userId,
        },
      },
    }),
  ]);

  const completionRate =
    plannedTasksThisWeek > 0
      ? Math.round((plannedTasksCompleted / plannedTasksThisWeek) * 100)
      : 0;

  return {
    assigned_tasks: plannedTasksThisWeek, // consider renaming to planned_tasks
    completed_tasks: plannedTasksCompleted, // consider renaming to planned_completed_tasks
    completion_rate: completionRate,
  };
}

/**
 * Get all dashboard stats in a single call (optimized)
 */
export async function getAllStats(client: PrismaClient = prisma) {
  const [
    overview,
    completion,
    priority,
    status,
    topPerformers,
    workload,
    recurring,
    trends,
  ] = await Promise.all([
    getOverviewStats(client),
    getCompletionRates(client),
    getPriorityStats(client),
    getStatusStats(client),
    getTopPerformers(5, client),
    getWorkloadDistribution(client),
    getRecurringStats(client),
    getTaskTrends(7, client),
  ]);

  return {
    overview,
    completion,
    priority,
    status,
    top_performers: topPerformers,
    workload,
    recurring,
    trends,
  };
}
