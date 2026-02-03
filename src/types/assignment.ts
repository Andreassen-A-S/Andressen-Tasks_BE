// export interface TaskAssignment {
//   assignment_id: string;
//   task_id: string;
//   user_id: string;
//   assigned_at: Date;
//   completed_at?: Date | null;
// }

export interface CreateTaskAssignmentInput {
  task_id: string;
  user_id: string;
}

export interface UpdateTaskAssignmentInput {
  task_id?: string;
  user_id?: string;
  completed_at?: Date | null;
}
