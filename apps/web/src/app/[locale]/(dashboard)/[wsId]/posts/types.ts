export interface PostEmail {
  id?: string | null;
  subject?: string | null;
  user_id?: string | null;
  recipient?: string | null;
  email?: string | null;
  email_id?: string | null;
  group_id?: string | null;
  group_name?: string | null;
  post_id?: string | null;
  post_title?: string | null;
  post_content?: string | null;
  is_completed?: boolean | null;
  ws_id?: string | null;
  notes?: string | null;
  post_created_at?: string | null;
  created_at?: Date | null;
  queue_status?:
    | 'queued'
    | 'processing'
    | 'sent'
    | 'failed'
    | 'blocked'
    | 'cancelled';
  queue_attempt_count?: number;
  queue_last_error?: string | null;
  queue_sent_at?: string | null;
  post_approval_status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  can_remove_approval?: boolean;
  queue_counts?: {
    queued: number;
    processing: number;
    sent: number;
    failed: number;
    blocked: number;
    cancelled: number;
  };
}
