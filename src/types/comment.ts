export interface TaskComment {
  comment_id: string;
  task_id: string;
  user_id: string;
  message: string;
  reply_to_comment_id?: string | null;
  reply_preview?: string | null;
  reply_author_id?: string | null;
  reply_author_name?: string | null;
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
  message?: string;
  upload_tokens?: string[];
  reply_to_comment_id?: string;
  mention_user_ids?: string[];
}

export interface UpdateCommentRequest {
  message: string;
}
