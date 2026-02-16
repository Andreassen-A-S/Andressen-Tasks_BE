/**
 * TypeScript types for dashboard statistics
 */

export interface OverviewStats {
  totalTasks: number;
  completedToday: number;
  pendingTasks: number;
  overdueTasks: number;
}

export interface CompletionRates {
  todayRate: number;
  weekRate: number;
  monthRate: number;
  avgCompletionDays: number;
}

export interface PriorityBreakdown {
  total: number;
  completed: number;
  overdue: number;
}

export interface PriorityStats {
  high: PriorityBreakdown;
  medium: PriorityBreakdown;
  low: PriorityBreakdown;
}

export interface StatusStats {
  pending: number;
  inProgress: number;
  completed: number;
  archived: number;
}

export interface TopPerformer {
  userId: string;
  name: string;
  email: string;
  completedCount: number;
  totalQuantity: number;
}

export interface WorkloadUser {
  userId: string;
  name: string;
  email: string;
  assignedTasks: number;
  completedTasks: number;
}

export interface RecurringStats {
  activeTemplates: number;
  upcomingInstances: number;
  completionRate: number;
}

export interface TrendDataPoint {
  date: string;
  created: number;
  completed: number;
}

export interface UserStats {
  userId: string;
  name?: string;
  email?: string;
  assignedTasks: number;
  completedTasks: number;
  completionRate: number;
}

export interface DashboardStats {
  overview: OverviewStats;
  completion: CompletionRates;
  priority: PriorityStats;
  status: StatusStats;
  topPerformers: TopPerformer[];
  workload: WorkloadUser[];
  recurring: RecurringStats;
  trends: TrendDataPoint[];
}
