import type {
  PostApprovalStatus,
  PostDeliveryIssueReason,
  PostEmailQueueStatus,
  PostReviewStage,
} from '../../../../../posts/types';

export interface GroupPostRecipientRow {
  row_key: string;
  check_created_at: string | null;
  notes: string | null;
  user_id: string;
  email_id: string | null;
  is_completed: boolean | null;
  has_check: boolean;
  approval_status: PostApprovalStatus | null;
  approval_rejection_reason: string | null;
  ws_id: string;
  email: string | null;
  recipient: string | null;
  user_display_name: string | null;
  user_full_name: string | null;
  user_phone: string | null;
  user_avatar_url: string | null;
  post_id: string | null;
  post_title: string | null;
  post_content: string | null;
  post_created_at: string | null;
  group_id: string | null;
  group_name: string | null;
  subject: string | null;
  queue_status: PostEmailQueueStatus | null;
  queue_attempt_count: number | null;
  queue_last_error: string | null;
  queue_sent_at: string | null;
  delivery_issue_reason: PostDeliveryIssueReason | null;
  can_remove_approval: boolean | null;
  review_stage: PostReviewStage;
}

export interface GroupPostStatusSummaryRow {
  total_count: number | null;
  missing_check_count: number | null;
  pending_approval_stage_count: number | null;
  approved_awaiting_delivery_count: number | null;
  undeliverable_count: number | null;
  queued_stage_count: number | null;
  processing_stage_count: number | null;
  sent_stage_count: number | null;
  delivery_failed_count: number | null;
  skipped_stage_count: number | null;
  rejected_stage_count: number | null;
  completed_count: number | null;
  incomplete_count: number | null;
  unchecked_count: number | null;
  pending_approval_count: number | null;
  approved_count: number | null;
  rejected_count: number | null;
  skipped_approval_count: number | null;
  queued_count: number | null;
  processing_count: number | null;
  sent_count: number | null;
  failed_count: number | null;
  blocked_count: number | null;
  cancelled_count: number | null;
  queue_skipped_count: number | null;
}
