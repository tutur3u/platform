import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/db';
import {
  autoSkipOldPostEmails,
  getPostEmailMaxAgeCutoff,
} from '@/lib/post-email-queue';
import type {
  PostApprovalStatus,
  PostEmail,
  PostEmailQueueStatus,
  PostEmailStatusSummary,
  PostsSearchParams,
} from './types';
import { isPostApprovalStatus, isPostEmailQueueStatus } from './types';

type PostEmailSummaryRpcRow =
  Database['public']['Functions']['get_workspace_post_email_status_summary']['Returns'][number];

type PostEmailRowRpc =
  Database['public']['Functions']['get_workspace_post_email_rows']['Returns'][number];

type PostEmailRowsRpcArgs =
  Database['public']['Functions']['get_workspace_post_email_rows']['Args'];

type PostEmailSummaryRpcArgs =
  Database['public']['Functions']['get_workspace_post_email_status_summary']['Args'];

function normalizeArrayParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value ? [value] : [];
}

function normalizeQueueStatus(
  value?: string
): PostEmailQueueStatus | undefined {
  return isPostEmailQueueStatus(value) ? value : undefined;
}

function normalizeApprovalStatus(
  value?: string
): PostApprovalStatus | undefined {
  return isPostApprovalStatus(value) ? value : undefined;
}

function mapPostEmailRow(row: PostEmailRowRpc): PostEmail {
  return {
    id: row.row_key,
    notes: row.notes,
    user_id: row.user_id,
    email_id: row.email_id,
    is_completed: row.is_completed,
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
    queue_status: row.queue_status as PostEmailQueueStatus,
    queue_attempt_count: row.queue_attempt_count,
    queue_last_error: row.queue_last_error,
    queue_sent_at: row.queue_sent_at,
    approval_status: row.approval_status ?? 'PENDING',
    approval_rejection_reason: row.approval_rejection_reason,
    can_remove_approval: row.can_remove_approval,
    created_at: row.check_created_at ? new Date(row.check_created_at) : null,
  };
}

function mapSummaryRow(
  row?: PostEmailSummaryRpcRow | null
): PostEmailStatusSummary {
  return {
    total: Number(row?.total_count ?? 0),
    queued: Number(row?.queued_count ?? 0),
    processing: Number(row?.processing_count ?? 0),
    sent: Number(row?.sent_count ?? 0),
    failed: Number(row?.failed_count ?? 0),
    blocked: Number(row?.blocked_count ?? 0),
    cancelled: Number(row?.cancelled_count ?? 0),
    skipped: Number(row?.skipped_count ?? 0),
    approved: Number(row?.approved_count ?? 0),
    pending: Number(row?.pending_approval_count ?? 0),
    rejected: Number(row?.rejected_count ?? 0),
  };
}

export async function getPostsPageData(
  wsId: string,
  {
    page = '1',
    pageSize = '10',
    includedGroups,
    excludedGroups,
    userId,
    approvalStatus,
    queueStatus,
  }: PostsSearchParams = {}
) {
  const sbAdmin = await createAdminClient();
  const parsedPage = Number.parseInt(page, 10);
  const parsedSize = Number.parseInt(pageSize, 10);
  const safePage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeSize =
    Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 10;
  const activeApprovalStatus = normalizeApprovalStatus(approvalStatus);
  const includedGroupIds = normalizeArrayParam(includedGroups);
  const excludedGroupIds = normalizeArrayParam(excludedGroups);
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
    ...(activeQueueStatus ? { p_queue_status: activeQueueStatus } : {}),
  };

  await autoSkipOldPostEmails(sbAdmin, { wsId });

  const [rowsResult, summaryResult] = await Promise.all([
    sbAdmin.rpc('get_workspace_post_email_rows', rowsArgs),
    sbAdmin.rpc('get_workspace_post_email_status_summary', summaryArgs),
  ]);

  if (rowsResult.error) {
    throw new Error(rowsResult.error.message);
  }

  if (summaryResult.error) {
    throw new Error(summaryResult.error.message);
  }

  const rows = rowsResult.data ?? [];
  const summary = mapSummaryRow(summaryResult.data?.[0]);

  return {
    postsData: {
      data: rows.map(mapPostEmailRow),
      count: Number(rows[0]?.total_count ?? 0),
    },
    postsStatus: summary,
  };
}
