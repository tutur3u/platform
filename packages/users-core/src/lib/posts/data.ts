import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/db';
import {
  isPostApprovalStatus,
  isPostEmailQueueStatus,
  type PostApprovalStatus,
  type PostDeliveryIssueReason,
  type PostEmail,
  type PostEmailQueueStatus,
  type PostEmailStatusSummary,
  type PostReviewStage,
  type PostsSearchParams,
} from '../post-types';
import { getPostEmailMaxAgeCutoff } from './date-range';
import { normalizePostEmailQueueStatus } from './status';

interface PostEmailRowRpc {
  row_key: string;
  notes: string | null;
  user_id: string;
  user_display_name: string | null;
  user_full_name: string | null;
  user_phone: string | null;
  user_avatar_url: string | null;
  email_id: string | null;
  is_completed: boolean | null;
  has_check: boolean;
  ws_id: string;
  email: string | null;
  recipient: string | null;
  post_id: string | null;
  post_title: string | null;
  post_content: string | null;
  post_created_at: string | null;
  group_id: string | null;
  group_name: string | null;
  subject: string | null;
  queue_status: string | null;
  queue_attempt_count: number | null;
  queue_last_error: string | null;
  queue_created_at?: string | null;
  queue_updated_at?: string | null;
  queue_last_attempt_at?: string | null;
  queue_claimed_at?: string | null;
  queue_cancelled_at?: string | null;
  queue_sent_at: string | null;
  queue_skipped_at?: string | null;
  delivery_issue_reason: string | null;
  approval_status: PostApprovalStatus | null;
  approval_rejection_reason: string | null;
  approval_approved_at?: string | null;
  approval_rejected_at?: string | null;
  can_remove_approval: boolean | null;
  check_created_at: string | null;
  review_stage: PostReviewStage;
  total_count?: number | null;
}

interface PostEmailSummaryRpcRow {
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

type PostEmailRowsRpcArgs =
  Database['private']['Functions']['get_workspace_post_review_rows']['Args'];
type PostEmailSummaryRpcArgs =
  Database['private']['Functions']['get_workspace_post_review_summary']['Args'];

function normalizeQueueStatus(value?: string | null) {
  return value && isPostEmailQueueStatus(value) ? value : undefined;
}

function normalizeApprovalStatus(value?: string | null) {
  return value && isPostApprovalStatus(value) ? value : undefined;
}

function mapPostEmailRow(row: PostEmailRowRpc): PostEmail {
  return {
    approval_approved_at: row.approval_approved_at ?? null,
    approval_rejected_at: row.approval_rejected_at ?? null,
    approval_rejection_reason: row.approval_rejection_reason,
    approval_status: row.approval_status ?? undefined,
    can_remove_approval: row.can_remove_approval ?? undefined,
    created_at: row.check_created_at ? new Date(row.check_created_at) : null,
    delivery_issue_reason:
      (row.delivery_issue_reason as PostDeliveryIssueReason | null) ?? null,
    email: row.email,
    email_id: row.email_id,
    group_id: row.group_id,
    group_name: row.group_name,
    has_check: row.has_check,
    id: row.row_key,
    is_completed: row.is_completed,
    notes: row.notes,
    post_content: row.post_content,
    post_created_at: row.post_created_at,
    post_id: row.post_id,
    post_title: row.post_title,
    queue_attempt_count: row.queue_attempt_count ?? undefined,
    queue_cancelled_at: row.queue_cancelled_at ?? null,
    queue_claimed_at: row.queue_claimed_at ?? null,
    queue_created_at: row.queue_created_at ?? null,
    queue_last_attempt_at: row.queue_last_attempt_at ?? null,
    queue_last_error: row.queue_last_error,
    queue_sent_at: row.queue_sent_at,
    queue_skipped_at: row.queue_skipped_at ?? null,
    queue_status: normalizePostEmailQueueStatus({
      approvalStatus: row.approval_status,
      emailId: row.email_id,
      queueStatus: row.queue_status as PostEmailQueueStatus | null,
    }),
    queue_updated_at: row.queue_updated_at ?? null,
    recipient: row.recipient,
    stage: row.review_stage,
    subject: row.subject,
    user_avatar_url: row.user_avatar_url,
    user_display_name: row.user_display_name,
    user_full_name: row.user_full_name,
    user_id: row.user_id,
    user_phone: row.user_phone,
    ws_id: row.ws_id,
  };
}

function mapSummaryRow(
  row?: PostEmailSummaryRpcRow | null
): PostEmailStatusSummary {
  return {
    approvals: {
      approved: Number(row?.approved_count ?? 0),
      pending: Number(row?.pending_approval_count ?? 0),
      rejected: Number(row?.rejected_count ?? 0),
      skipped: Number(row?.skipped_approval_count ?? 0),
    },
    queue: {
      blocked: Number(row?.blocked_count ?? 0),
      cancelled: Number(row?.cancelled_count ?? 0),
      failed: Number(row?.failed_count ?? 0),
      processing: Number(row?.processing_count ?? 0),
      queued: Number(row?.queued_count ?? 0),
      sent: Number(row?.sent_count ?? 0),
      skipped: Number(row?.queue_skipped_count ?? 0),
    },
    stages: {
      approved_awaiting_delivery: Number(
        row?.approved_awaiting_delivery_count ?? 0
      ),
      delivery_failed: Number(row?.delivery_failed_count ?? 0),
      missing_check: Number(row?.missing_check_count ?? 0),
      pending_approval: Number(row?.pending_approval_stage_count ?? 0),
      processing: Number(row?.processing_stage_count ?? 0),
      queued: Number(row?.queued_stage_count ?? 0),
      rejected: Number(row?.rejected_stage_count ?? 0),
      sent: Number(row?.sent_stage_count ?? 0),
      skipped: Number(row?.skipped_stage_count ?? 0),
      undeliverable: Number(row?.undeliverable_count ?? 0),
    },
    total: Number(row?.total_count ?? 0),
  };
}

export async function getWorkspacePostsPageData(
  wsId: string,
  {
    approvalStatus,
    end,
    excludedGroups = [],
    includedGroups = [],
    page = 1,
    pageSize = 10,
    queueStatus,
    stage,
    start,
    userId,
  }: PostsSearchParams = {}
) {
  const safePage = Number.isFinite(page) && Number(page) > 0 ? Number(page) : 1;
  const safeSize =
    Number.isFinite(pageSize) && Number(pageSize) > 0 ? Number(pageSize) : 10;
  const activeApprovalStatus = normalizeApprovalStatus(approvalStatus);
  const activeQueueStatus = normalizeQueueStatus(queueStatus);
  const includedGroupIds = includedGroups ?? [];
  const excludedGroupIds = excludedGroups ?? [];
  const cutoff = getPostEmailMaxAgeCutoff();
  const commonArgs = {
    p_ws_id: wsId,
    p_cutoff: cutoff,
    ...(includedGroupIds.length > 0
      ? { p_included_group_ids: includedGroupIds }
      : {}),
    ...(excludedGroupIds.length > 0
      ? { p_excluded_group_ids: excludedGroupIds }
      : {}),
    ...(start ? { p_start_date: start } : {}),
    ...(end ? { p_end_date: end } : {}),
    ...(userId ? { p_user_id: userId } : {}),
    ...(activeApprovalStatus
      ? { p_approval_status: activeApprovalStatus }
      : {}),
    ...(activeQueueStatus ? { p_queue_status: activeQueueStatus } : {}),
  };
  const rowsArgs: PostEmailRowsRpcArgs = {
    ...commonArgs,
    p_limit: safeSize,
    p_offset: (safePage - 1) * safeSize,
    ...(stage ? { p_stage: [stage] } : {}),
  };
  const summaryArgs: PostEmailSummaryRpcArgs = commonArgs;
  const sbAdmin = await createAdminClient();
  const [rowsResult, summaryResult] = await Promise.all([
    sbAdmin.schema('private').rpc('get_workspace_post_review_rows', rowsArgs),
    sbAdmin
      .schema('private')
      .rpc('get_workspace_post_review_summary', summaryArgs),
  ]);

  if (rowsResult.error) throw new Error(rowsResult.error.message);
  if (summaryResult.error) throw new Error(summaryResult.error.message);

  const rows = (rowsResult.data ?? []) as PostEmailRowRpc[];
  const summaryRow =
    (summaryResult.data?.[0] as PostEmailSummaryRpcRow | undefined) ?? null;

  return {
    postsData: {
      count: Number(rows[0]?.total_count ?? 0),
      data: rows.map(mapPostEmailRow),
    },
    postsStatus: mapSummaryRow(summaryRow),
  };
}
