export interface TaskComment {
  comment_id: string;
  task_id: string;
  user_id: string;
  message: string;
  created_at: Date;
  updated_at: Date;
  author?: {
    user_id: string;
    name: string | null;
    email: string;
    role: string;
  };
}

export interface CreateCommentRequest {
  message: string;
}

export interface UpdateCommentRequest {
  message: string;
}
