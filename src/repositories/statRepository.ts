import { prisma } from "../db/prisma";
import {
  TaskStatus,
  TaskPriority,
  type Prisma,
} from "../generated/prisma/client";
import {
  appDayBounds,
  appWeekBoundsUTC,
  dateKeyBounds,
  appDateKey,
  subDaysFromKey,
  addDaysToKey,
} from "../utils/dateUtils";

/**
 * Stats repository with transaction support
 * All methods accept an optional transaction client
 */

type TransactionClient = Prisma.TransactionClient;
type PrismaClient = typeof prisma | TransactionClient;

function dateKeyDiffInDays(fromKey: string, toKey: string): number {
  const [fromYear, fromMonth, fromDay] = fromKey
    .split("-")
    .map(Number) as [number, number, number];
  const [toYear, toMonth, toDay] = toKey
    .split("-")
    .map(Number) as [number, number, number];
  const from = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const to = Date.UTC(toYear, toMonth - 1, toDay);

  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

/**
 * Get overview statistics
 */
export async function getOverviewStats(client: PrismaClient = prisma) {
  const now = new Date();
  const { start: todayStart } = appDayBounds(now);
  const todayKey = appDateKey(now);

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
          deadline: { lt: todayStart },
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
  return getCompletionRatesForWindow(30, client);
}

export async function getCompletionRatesForWindow(
  days: number = 30,
  client: PrismaClient = prisma,
) {
  const now = new Date();
  const todayStart = appDayBounds(now).start;
  const weekStart = appWeekBoundsUTC(now).start;
  const windowStartKey = subDaysFromKey(appDateKey(now), days - 1);
  const windowStart = dateKeyBounds(windowStartKey).start;

  const [todayStats, weekStats, periodStats] = await Promise.all([
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

    // This period (rolling window of `days` days)
    client.task.groupBy({
      by: ["status"],
      where: {
        created_at: { gte: windowStart },
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
      completed_at: { gte: windowStart },
    },
    select: {
      created_at: true,
      completed_at: true,
      deadline: true,
    },
  });

  let avgCompletionDays = 0;
  let onTimeCompleted = 0;
  let lateTasks = 0;
  let totalDelayDays = 0;

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

    for (const task of completedTasks) {
      if (!task.completed_at) continue;

      const completedKey = appDateKey(task.completed_at);
      const deadlineKey = appDateKey(task.deadline);
      const delayDays = dateKeyDiffInDays(deadlineKey, completedKey);

      if (delayDays <= 0) {
        onTimeCompleted += 1;
      } else {
        lateTasks += 1;
        totalDelayDays += delayDays;
      }
    }
  }

  return {
    today_rate: calculateRate(todayStats),
    week_rate: calculateRate(weekStats),
    period_rate: calculateRate(periodStats),
    avg_completion_days: avgCompletionDays,
    completed_in_period: completedTasks.length,
    on_time_completed: onTimeCompleted,
    on_time_rate:
      completedTasks.length > 0
        ? Math.round((onTimeCompleted / completedTasks.length) * 100)
        : 0,
    avg_delay_days:
      lateTasks > 0 ? Math.round(totalDelayDays / lateTasks) : 0,
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
      deadline: { lt: new Date(appDateKey(now)) },
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
  return getTopPerformersForWindow(30, limit, client);
}

export async function getTopPerformersForWindow(
  days: number = 30,
  limit: number = 5,
  client: PrismaClient = prisma,
) {
  const windowStartKey = subDaysFromKey(appDateKey(), days - 1);
  const windowStart = dateKeyBounds(windowStartKey).start;

  const performers = await client.task.groupBy({
    by: ["completed_by"],
    where: {
      status: TaskStatus.DONE,
      completed_by: { not: null },
      completed_at: { gte: windowStart },
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
  const nextWeekKey = addDaysToKey(appDateKey(now), 7);
  const nextWeek = new Date(nextWeekKey);

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
  const todayKey = appDateKey();
  const dateKeys = Array.from({ length: days }, (_, i) =>
    subDaysFromKey(todayKey, days - 1 - i),
  );

  const trends = await Promise.all(
    dateKeys.map(async (dateKey) => {
      const { start, end } = dateKeyBounds(dateKey);

      const [created, completed] = await Promise.all([
        client.task.count({
          where: {
            created_at: { gte: start, lt: end },
          },
        }),
        client.task.count({
          where: {
            status: TaskStatus.DONE,
            completed_at: { gte: start, lt: end },
          },
        }),
      ]);

      return { date: dateKey, created, completed };
    }),
  );

  return trends;
}

export async function getProjectStatsForWindow(
  days: number = 30,
  client: PrismaClient = prisma,
) {
  const now = new Date();
  const todayKey = appDateKey(now);
  const windowStartKey = subDaysFromKey(todayKey, days - 1);
  const windowStart = dateKeyBounds(windowStartKey).start;
  const inactiveStatuses = [
    TaskStatus.DONE,
    TaskStatus.ARCHIVED,
    TaskStatus.REJECTED,
  ];

  const [projects, activeTasks, overdueActiveTasks, completedTasks] =
    await Promise.all([
      client.project.findMany({
        select: {
          project_id: true,
          name: true,
          color: true,
        },
        orderBy: { name: "asc" },
      }),
      client.task.groupBy({
        by: ["project_id"],
        where: {
          status: { notIn: inactiveStatuses },
        },
        _count: { task_id: true },
      }),
      client.task.groupBy({
        by: ["project_id"],
        where: {
          deadline: { lt: appDayBounds(now).start },
          status: { notIn: inactiveStatuses },
        },
        _count: { task_id: true },
      }),
      client.task.findMany({
        where: {
          status: TaskStatus.DONE,
          completed_at: { gte: windowStart },
        },
        select: {
          project_id: true,
          deadline: true,
          completed_at: true,
        },
      }),
    ]);

  const completedByProject = new Map<
    string,
    { completed: number; onTime: number; late: number }
  >();

  for (const task of completedTasks) {
    if (!task.completed_at) continue;

    const current = completedByProject.get(task.project_id) ?? {
      completed: 0,
      onTime: 0,
      late: 0,
    };
    const completedKey = appDateKey(task.completed_at);
    const deadlineKey = appDateKey(task.deadline);
    const delayDays = dateKeyDiffInDays(deadlineKey, completedKey);

    current.completed += 1;
    if (delayDays <= 0) {
      current.onTime += 1;
    } else {
      current.late += 1;
    }

    completedByProject.set(task.project_id, current);
  }

  const activeByProject = new Map(activeTasks.map((t) => [t.project_id, t._count.task_id]));
  const overdueByProject = new Map(overdueActiveTasks.map((t) => [t.project_id, t._count.task_id]));

  return projects
    .map((project) => {
      const completion = completedByProject.get(project.project_id) ?? {
        completed: 0,
        onTime: 0,
        late: 0,
      };
      const activeCount = activeByProject.get(project.project_id) ?? 0;
      const overdueCount = overdueByProject.get(project.project_id) ?? 0;

      return {
        project_id: project.project_id,
        name: project.name,
        color: project.color,
        completed_count: completion.completed,
        on_time_rate:
          completion.completed > 0
            ? Math.round((completion.onTime / completion.completed) * 100)
            : 0,
        late_completed_count: completion.late,
        active_tasks: activeCount,
        overdue_active_tasks: overdueCount,
      };
    })
    .filter(
      (project) =>
        project.completed_count > 0 ||
        project.active_tasks > 0 ||
        project.overdue_active_tasks > 0,
    )
    .sort((a, b) => {
      if (b.overdue_active_tasks !== a.overdue_active_tasks) {
        return b.overdue_active_tasks - a.overdue_active_tasks;
      }
      if (b.late_completed_count !== a.late_completed_count) {
        return b.late_completed_count - a.late_completed_count;
      }
      return a.on_time_rate - b.on_time_rate;
    });
}

/**
 * Get user overdue tasks count
 */
export async function getUserOverdueTasks(
  userId: string,
  client: PrismaClient = prisma,
) {
  return client.task.count({
    where: {
      deadline: { lt: new Date(appDateKey()) },
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
  const { start: weekStart, end: weekEnd } = appWeekBoundsUTC();

  // planned tasks = assignments where task is scheduled this week
  const plannedWhere = {
    user_id: userId,
    task: {
      start_date: { gte: weekStart, lt: weekEnd },
    },
  } as const;

  const [plannedTasksThisWeek, plannedTasksCompleted] = await Promise.all([
    client.taskAssignment.count({
      where: plannedWhere,
    }),

    // planned + completed (credit)
    client.taskAssignment.count({
      where: {
        user_id: userId,
        task: {
          start_date: { gte: weekStart, lt: weekEnd },
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
  return getStatsForWindow(30, client);
}

export async function getStatsForWindow(
  days: number = 30,
  client: PrismaClient = prisma,
) {
  const [
    overview,
    completion,
    priority,
    status,
    topPerformers,
    workload,
    recurring,
    trends,
    projects,
  ] = await Promise.all([
    getOverviewStats(client),
    getCompletionRatesForWindow(days, client),
    getPriorityStats(client),
    getStatusStats(client),
    getTopPerformersForWindow(days, 5, client),
    getWorkloadDistribution(client),
    getRecurringStats(client),
    getTaskTrends(Math.min(days, 90), client),
    getProjectStatsForWindow(days, client),
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
    projects,
  };
}
