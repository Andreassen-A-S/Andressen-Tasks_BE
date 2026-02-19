/**
 * TypeScript types for dashboard statistics
 */

export interface OverviewStats {
  total_tasks: number;
  completed_today: number;
  pending_tasks: number;
  overdue_tasks: number;
}

export interface CompletionRates {
  today_rate: number;
  week_rate: number;
  month_rate: number;
  avg_completion_days: number;
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
  in_progress: number;
  completed: number;
  archived: number;
  rejected: number;
}

export interface TopPerformer {
  user_id: string;
  name: string;
  email: string;
  completed_count: number;
  total_quantity: number;
}

export interface WorkloadUser {
  user_id: string;
  name: string;
  email: string;
  assigned_tasks: number;
  completed_tasks: number;
}

export interface RecurringStats {
  active_templates: number;
  upcoming_instances: number;
  completion_rate: number;
}

export interface TrendDataPoint {
  date: string;
  created: number;
  completed: number;
}

export interface UserStats {
  user_id: string;
  name?: string;
  email?: string;
  assigned_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  completion_rate: number;
  weekly_stats: {
    assigned_tasks: number;
    completed_tasks: number;
    completion_rate: number;
  };
}

export interface DashboardStats {
  overview: OverviewStats;
  completion: CompletionRates;
  priority: PriorityStats;
  status: StatusStats;
  top_performers: TopPerformer[];
  workload: WorkloadUser[];
  recurring: RecurringStats;
  trends: TrendDataPoint[];
}
