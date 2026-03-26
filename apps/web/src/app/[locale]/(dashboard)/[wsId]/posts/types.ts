import { POST_EMAIL_QUEUE_STATUSES } from '@/lib/post-email-queue/statuses';

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

export const POST_REVIEW_STAGES = [
  'missing_check',
  'pending_approval',
  'approved_awaiting_delivery',
  'queued',
  'processing',
  'sent',
  'delivery_failed',
  'skipped',
  'rejected',
] as const;

export const DEFAULT_POST_REVIEW_STAGES = [
  'missing_check',
  'pending_approval',
] as const;

export type PostApprovalStatus = (typeof POST_APPROVAL_STATUSES)[number];
export type PostReviewStage = (typeof POST_REVIEW_STAGES)[number];

export function isPostApprovalStatus(
  value?: string
): value is PostApprovalStatus {
  return POST_APPROVAL_STATUSES.includes(value as PostApprovalStatus);
}

export function isPostReviewStage(value?: string): value is PostReviewStage {
  return POST_REVIEW_STAGES.includes(value as PostReviewStage);
}

export interface PostsSearchParams {
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  userId?: string;
  stage?: string | string[];
  queueStatus?: string;
  approvalStatus?: string;
  cursor?: string;
}

export interface PostEmailStatusSummary {
  total: number;
  stages: Record<PostReviewStage, number>;
  approvals: {
    pending: number;
    approved: number;
    rejected: number;
    skipped: number;
  };
  queue: {
    queued: number;
    processing: number;
    sent: number;
    failed: number;
    blocked: number;
    cancelled: number;
    skipped: number;
  };
}

export interface PostEmail {
  id?: string | null;
  subject?: string | null;
  user_id?: string | null;
  user_display_name?: string | null;
  user_full_name?: string | null;
  user_phone?: string | null;
  user_avatar_url?: string | null;
  recipient?: string | null;
  email?: string | null;
  email_id?: string | null;
  group_id?: string | null;
  group_name?: string | null;
  post_id?: string | null;
  post_title?: string | null;
  post_content?: string | null;
  is_completed?: boolean | null;
  has_check?: boolean;
  ws_id?: string | null;
  notes?: string | null;
  post_created_at?: string | null;
  created_at?: Date | null;
  stage: PostReviewStage;
  queue_status?: PostEmailQueueStatus;
  queue_attempt_count?: number;
  queue_last_error?: string | null;
  queue_sent_at?: string | null;
  approval_status?: PostApprovalStatus;
  approval_rejection_reason?: string | null;
  can_remove_approval?: boolean;
}
