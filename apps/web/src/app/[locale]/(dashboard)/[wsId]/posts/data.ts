import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  autoSkipOldPostEmails,
  getPostEmailMaxAgeCutoff,
} from '@/lib/post-email-queue';
import { normalizePostEmailQueueStatus } from './status-derivation';
import type {
  PostApprovalStatus,
  PostDeliveryIssueReason,
  PostEmail,
  PostEmailQueueStatus,
  PostEmailStatusSummary,
  PostsSearchParams,
} from './types';
import {
  isPostApprovalStatus,
  isPostEmailQueueStatus,
  type PostReviewStage,
} from './types';

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
  queue_sent_at: string | null;
  delivery_issue_reason: string | null;
  approval_status: PostApprovalStatus | null;
  approval_rejection_reason: string | null;
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

interface PostEmailRowsRpcArgs {
  p_ws_id: string;
  p_cutoff: string;
  p_limit: number;
  p_offset: number;
  p_included_group_ids?: string[];
  p_excluded_group_ids?: string[];
  p_stage?: PostReviewStage[];
  p_approval_status?: PostApprovalStatus;
  p_user_id?: string;
  p_queue_status?: PostEmailQueueStatus;
}

interface PostEmailSummaryRpcArgs {
  p_ws_id: string;
  p_cutoff: string;
  p_included_group_ids?: string[];
  p_excluded_group_ids?: string[];
  p_user_id?: string;
  p_approval_status?: PostApprovalStatus;
  p_queue_status?: PostEmailQueueStatus;
}

function normalizeQueueStatus(
  value?: string | null
): PostEmailQueueStatus | undefined {
  return value && isPostEmailQueueStatus(value) ? value : undefined;
}

function normalizeApprovalStatus(
  value?: string | null
): PostApprovalStatus | undefined {
  return value && isPostApprovalStatus(value) ? value : undefined;
}

function mapPostEmailRow(row: PostEmailRowRpc): PostEmail {
  return {
    id: row.row_key,
    notes: row.notes,
    user_id: row.user_id,
    user_display_name: row.user_display_name,
    user_full_name: row.user_full_name,
    user_phone: row.user_phone,
    user_avatar_url: row.user_avatar_url,
    email_id: row.email_id,
    is_completed: row.is_completed,
    has_check: row.has_check,
    ws_id: row.ws_id,
    email: row.email,
    recipient: row.recipient,
    post_id: row.post_id,
    post_title: row.post_title,
    post_content: row.post_content,
    post_created_at: row.post_created_at,
    group_id: row.group_id,
    group_name: row.group_name,
    subject: row.subject,
    queue_status: normalizePostEmailQueueStatus({
      approvalStatus: row.approval_status,
      emailId: row.email_id,
      queueStatus: row.queue_status as PostEmailQueueStatus | null,
    }),
    queue_attempt_count: row.queue_attempt_count ?? undefined,
    queue_last_error: row.queue_last_error,
    queue_sent_at: row.queue_sent_at,
    delivery_issue_reason:
      (row.delivery_issue_reason as PostDeliveryIssueReason | null) ?? null,
    approval_status: row.approval_status ?? undefined,
    approval_rejection_reason: row.approval_rejection_reason,
    can_remove_approval: row.can_remove_approval ?? undefined,
    created_at: row.check_created_at ? new Date(row.check_created_at) : null,
    stage: row.review_stage as PostReviewStage,
  };
}

function mapSummaryRow(
  row?: PostEmailSummaryRpcRow | null
): PostEmailStatusSummary {
  return {
    total: Number(row?.total_count ?? 0),
    stages: {
      missing_check: Number(row?.missing_check_count ?? 0),
      pending_approval: Number(row?.pending_approval_stage_count ?? 0),
      approved_awaiting_delivery: Number(
        row?.approved_awaiting_delivery_count ?? 0
      ),
      undeliverable: Number(row?.undeliverable_count ?? 0),
      queued: Number(row?.queued_stage_count ?? 0),
      processing: Number(row?.processing_stage_count ?? 0),
      sent: Number(row?.sent_stage_count ?? 0),
      delivery_failed: Number(row?.delivery_failed_count ?? 0),
      skipped: Number(row?.skipped_stage_count ?? 0),
      rejected: Number(row?.rejected_stage_count ?? 0),
    },
    approvals: {
      pending: Number(row?.pending_approval_count ?? 0),
      approved: Number(row?.approved_count ?? 0),
      rejected: Number(row?.rejected_count ?? 0),
      skipped: Number(row?.skipped_approval_count ?? 0),
    },
    queue: {
      queued: Number(row?.queued_count ?? 0),
      processing: Number(row?.processing_count ?? 0),
      sent: Number(row?.sent_count ?? 0),
      failed: Number(row?.failed_count ?? 0),
      blocked: Number(row?.blocked_count ?? 0),
      cancelled: Number(row?.cancelled_count ?? 0),
      skipped: Number(row?.queue_skipped_count ?? 0),
    },
  };
}

export async function getPostsPageData(
  wsId: string,
  {
    page = 1,
    pageSize = 10,
    includedGroups,
    excludedGroups,
    userId,
    stage,
    approvalStatus,
    queueStatus,
  }: PostsSearchParams = {}
) {
  const sbAdmin = await createAdminClient();
  const parsedPage = typeof page === 'number' ? page : Number.NaN;
  const parsedSize = typeof pageSize === 'number' ? pageSize : Number.NaN;
  const safePage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeSize =
    Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 10;
  const activeApprovalStatus = normalizeApprovalStatus(approvalStatus);
  const includedGroupIds = includedGroups ?? [];
  const excludedGroupIds = excludedGroups ?? [];
  const activeStage = stage ?? undefined;
  const activeQueueStatus = normalizeQueueStatus(queueStatus);
  const cutoff = getPostEmailMaxAgeCutoff();
  const offset = (safePage - 1) * safeSize;
  const rowsArgs: PostEmailRowsRpcArgs = {
    p_ws_id: wsId,
    p_cutoff: cutoff,
    p_limit: safeSize,
    p_offset: offset,
    ...(includedGroupIds.length > 0
      ? { p_included_group_ids: includedGroupIds }
      : {}),
    ...(excludedGroupIds.length > 0
      ? { p_excluded_group_ids: excludedGroupIds }
      : {}),
    ...(activeStage ? { p_stage: [activeStage] } : {}),
    ...(activeApprovalStatus
      ? { p_approval_status: activeApprovalStatus }
      : {}),
    ...(userId ? { p_user_id: userId } : {}),
    ...(activeQueueStatus ? { p_queue_status: activeQueueStatus } : {}),
  };
  const summaryArgs: PostEmailSummaryRpcArgs = {
    p_ws_id: wsId,
    p_cutoff: cutoff,
    ...(includedGroupIds.length > 0
      ? { p_included_group_ids: includedGroupIds }
      : {}),
    ...(excludedGroupIds.length > 0
      ? { p_excluded_group_ids: excludedGroupIds }
      : {}),
    ...(userId ? { p_user_id: userId } : {}),
    ...(activeApprovalStatus
      ? { p_approval_status: activeApprovalStatus }
      : {}),
    ...(activeQueueStatus ? { p_queue_status: activeQueueStatus } : {}),
  };

  await autoSkipOldPostEmails(sbAdmin, { wsId });

  const [rowsResult, summaryResult] = await Promise.all([
    sbAdmin.rpc('get_workspace_post_review_rows', rowsArgs),
    sbAdmin.rpc('get_workspace_post_review_summary', summaryArgs),
  ]);

  if (rowsResult.error) {
    throw new Error(rowsResult.error.message);
  }

  if (summaryResult.error) {
    throw new Error(summaryResult.error.message);
  }

  const rows = (rowsResult.data ?? []) as PostEmailRowRpc[];
  const summary = mapSummaryRow(
    (summaryResult.data?.[0] as PostEmailSummaryRpcRow | undefined) ?? null
  );

  return {
    postsData: {
      data: rows.map(mapPostEmailRow),
      count: Number(rows[0]?.total_count ?? 0),
    },
    postsStatus: summary,
  };
}
