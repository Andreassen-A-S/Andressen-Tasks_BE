export interface CreateTaskAssignmentInput {
  task_id: string;
  user_id: string;
}

export interface UpdateTaskAssignmentInput {
  task_id?: string;
  user_id?: string;
  completed_at?: Date | null;
}
