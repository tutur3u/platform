export const POST_EMAIL_QUEUE_STATUSES = [
  'queued',
  'processing',
  'sent',
  'failed',
  'blocked',
  'cancelled',
  'skipped',
] as const;

export type PostEmailQueueStatus = (typeof POST_EMAIL_QUEUE_STATUSES)[number];

export function isPostEmailQueueStatus(
  value?: string
): value is PostEmailQueueStatus {
  return POST_EMAIL_QUEUE_STATUSES.includes(value as PostEmailQueueStatus);
}

export const POST_APPROVAL_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SKIPPED',
] as const;

export type PostApprovalStatus = (typeof POST_APPROVAL_STATUSES)[number];

export function isPostApprovalStatus(
  value?: string
): value is PostApprovalStatus {
  return POST_APPROVAL_STATUSES.includes(value as PostApprovalStatus);
}

export interface PostsSearchParams {
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  userId?: string;
  queueStatus?: string;
  approvalStatus?: string;
  cursor?: string;
}

export interface PostEmailStatusSummary {
  total: number;
  queued: number;
  processing: number;
  sent: number;
  failed: number;
  blocked: number;
  cancelled: number;
  skipped: number;
  pending: number;
  approved: number;
  rejected: number;
}

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
  queue_status?: PostEmailQueueStatus;
  queue_attempt_count?: number;
  queue_last_error?: string | null;
  queue_sent_at?: string | null;
  approval_status?: PostApprovalStatus;
  approval_rejection_reason?: string | null;
  can_remove_approval?: boolean;
  queue_counts?: {
    queued: number;
    processing: number;
    sent: number;
    failed: number;
    blocked: number;
    cancelled: number;
    skipped: number;
  };
}
