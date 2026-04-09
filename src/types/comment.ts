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

export interface CommentAttachmentInput {
  gcs_path: string;
  file_name?: string | null;
  mime_type?: string | null;
}

export interface CreateCommentRequest {
  message?: string;
  attachments?: CommentAttachmentInput[];
}

export interface UpdateCommentRequest {
  message: string;
}
