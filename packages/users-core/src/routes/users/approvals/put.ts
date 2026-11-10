import {
  hasReportFeedback,
  REPORT_FEEDBACK_REQUIRED,
} from '../../../features/reports/report-feedback';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifySecret,
} from '@tuturuuu/utils/workspace-helper';
import { getWorkspaceUserLinkForUser } from '@tuturuuu/utils/workspace-user-link';
import { NextResponse } from 'next/server';
import {
  isReportDeliveryLocked,
  REPORT_DELIVERY_LOCKED_MESSAGE,
} from '../../../reports/delivery-lock';
import {
  ApprovalMutationSchema,
  type ApprovalRouteActor,
  type ApprovalRouteParams,
  cancelQueuedPostEmails,
  hasPostEmailBeenSent,
  type PostApprovalCheckWithGroup,
  parsePostApprovalItemId,
} from './shared';

import { isReportBulkApprovalEnabled } from './report-bulk-approval';

const POST_EMAIL_SEND_PERMISSION = 'send_user_group_post_emails';

async function shouldQueuePostEmails(
  permissions: Awaited<ReturnType<typeof getPermissions>>,
  wsId: string
) {
  if (
    !permissions ||
    permissions.withoutPermission(POST_EMAIL_SEND_PERMISSION)
  ) {
    return false;
  }
  return verifySecret({
    forceAdmin: true,
    name: 'ENABLE_EMAIL_SENDING',
    value: 'true',
    wsId,
  });
}

async function reconcileApprovedPostEmails(
  sbAdmin: TypedSupabaseClient,
  wsId: string
) {
  const { error } = await sbAdmin
    .schema('private')
    .rpc('reconcile_orphaned_approved_post_email_queue', {
      p_skip_posts: 0,
      p_ws_id: wsId,
    });
  if (error) throw error;
}

async function assertReportInWorkspace(
  sbAdmin: TypedSupabaseClient,
  reportId: string,
  wsId: string
) {
  const { data, error } = await sbAdmin
    .schema('private')
    .from('external_user_monthly_reports_workspace_view')
    .select('id, feedback')
    .eq('id', reportId)
    .eq('user_ws_id', wsId)
    .eq('group_ws_id', wsId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getPostCheckInWorkspace(
  sbAdmin: TypedSupabaseClient,
  itemId: string,
  wsId: string
) {
  const parsedItem = parsePostApprovalItemId(itemId);
  if (!parsedItem) return null;

  const { data, error } = await sbAdmin
    .schema('private')
    .from('user_group_post_checks')
    .select(
      'post_id, user_id, approval_status, user_group_posts!inner(group_id, workspace_user_groups!inner(ws_id))'
    )
    .eq('post_id', parsedItem.postId)
    .eq('user_id', parsedItem.userId)
    .eq('user_group_posts.workspace_user_groups.ws_id', wsId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        item: data as unknown as PostApprovalCheckWithGroup,
        parsedItem,
      }
    : null;
}

function approvalUpdate(
  action: 'approve' | 'reject' | 'unapprove',
  actorWorkspaceUserId: string,
  reason?: string
) {
  const now = new Date().toISOString();
  if (action === 'approve') {
    return {
      approval_status: 'APPROVED' as const,
      approved_at: now,
      approved_by: actorWorkspaceUserId,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
    };
  }
  if (action === 'reject') {
    return {
      approval_status: 'REJECTED' as const,
      approved_at: null,
      approved_by: null,
      rejected_at: now,
      rejected_by: actorWorkspaceUserId,
      rejection_reason: reason?.trim() || null,
    };
  }
  return {
    approval_status: 'PENDING' as const,
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
  };
}

function reportApprovalUpdate(
  action: 'approve' | 'reject',
  actorWorkspaceUserId: string,
  reason?: string
) {
  const update = approvalUpdate(action, actorWorkspaceUserId, reason);
  const { approval_status, ...timestamps } = update;
  return {
    ...timestamps,
    report_approval_status: approval_status,
  };
}

export async function handlePutApprovalsRequest(
  request: Request,
  { params }: ApprovalRouteParams,
  actor: ApprovalRouteActor
) {
  try {
    const { wsId: rawWsId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);
    const permissions = await getPermissions({ request, user: actor, wsId });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const parsed = ApprovalMutationSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { action, filters, itemId, kind, reason } = parsed.data;
    if (
      (kind === 'reports' &&
        !permissions.containsPermission('approve_reports')) ||
      (kind === 'posts' && !permissions.containsPermission('approve_posts'))
    ) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    if (
      (action === 'approve' || action === 'reject' || action === 'unapprove') &&
      !itemId
    ) {
      return NextResponse.json(
        { message: 'Item ID is required' },
        { status: 400 }
      );
    }
    if (action === 'reject' && !reason?.trim()) {
      return NextResponse.json(
        { message: 'Rejection reason is required' },
        { status: 400 }
      );
    }
    if (action === 'unapprove' && kind !== 'posts') {
      return NextResponse.json(
        { message: 'Unapprove is only supported for posts' },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient({ noCookie: true });
    if (
      kind === 'reports' &&
      action === 'approveAll' &&
      !(await isReportBulkApprovalEnabled(sbAdmin, wsId))
    ) {
      return NextResponse.json(
        {
          code: 'REPORT_BULK_APPROVAL_DISABLED',
          message:
            'Bulk report approval is disabled. Chức năng duyệt tất cả báo cáo tháng đang tắt.',
          messageEn:
            'Bulk report approval is disabled. An administrator can enable it in workspace approval settings.',
          messageVi:
            'Chức năng duyệt tất cả báo cáo tháng đang tắt. Quản trị viên có thể bật trong cài đặt phê duyệt của không gian làm việc.',
        },
        { status: 403 }
      );
    }
    const actorLink = await getWorkspaceUserLinkForUser(wsId, actor.id, {
      authorizationClient: sbAdmin,
    });
    if (!actorLink?.virtual_user_id) {
      return NextResponse.json(
        { message: 'User not found in workspace' },
        { status: 403 }
      );
    }

    const privateDb = sbAdmin.schema('private');
    const actorWorkspaceUserId = actorLink.virtual_user_id;
    let approvedPosts = false;
    let approvedCount = 0;
    let skippedEmptyCount = 0;

    if (action === 'approve' || action === 'reject') {
      if (kind === 'reports') {
        const report = await assertReportInWorkspace(sbAdmin, itemId!, wsId);
        if (!report) {
          return NextResponse.json(
            { message: 'Report not found' },
            { status: 404 }
          );
        }
        if (action === 'approve' && !hasReportFeedback(report.feedback)) {
          return NextResponse.json(REPORT_FEEDBACK_REQUIRED, { status: 422 });
        }
        let mutation = privateDb
          .from('external_user_monthly_reports')
          .update(reportApprovalUpdate(action, actorWorkspaceUserId, reason))
          .eq('id', itemId!);
        if (action === 'approve') {
          // Approval cannot race an edit that clears the checked feedback.
          if (!hasReportFeedback(report.feedback))
            return NextResponse.json(REPORT_FEEDBACK_REQUIRED, { status: 422 });
          mutation = mutation.eq('feedback', report.feedback);
        }
        const { data, error } = await mutation.select('id');
        if (error) throw error;
        if (!data?.length)
          return NextResponse.json(
            { message: 'Report changed. Refresh before approving.' },
            { status: 409 }
          );
        approvedCount = action === 'approve' ? data.length : 0;
      } else {
        if (!parsePostApprovalItemId(itemId!)) {
          return NextResponse.json(
            { message: 'Invalid post approval item ID' },
            { status: 400 }
          );
        }
        const postCheck = await getPostCheckInWorkspace(sbAdmin, itemId!, wsId);
        if (!postCheck) {
          return NextResponse.json(
            { message: 'Post approval item not found' },
            { status: 404 }
          );
        }
        const { error } = await privateDb
          .from('user_group_post_checks')
          .update(approvalUpdate(action, actorWorkspaceUserId, reason))
          .eq('post_id', postCheck.parsedItem.postId)
          .eq('user_id', postCheck.parsedItem.userId);
        if (error) throw error;

        if (action === 'approve') {
          approvedPosts = true;
        } else {
          await cancelQueuedPostEmails(sbAdmin, postCheck.parsedItem.postId, [
            postCheck.parsedItem.userId,
          ]);
        }
      }
    } else if (action === 'approveAll') {
      if (kind === 'reports') {
        let query = privateDb
          .from('external_user_monthly_reports_workspace_view')
          .select('id, feedback')
          .eq('user_ws_id', wsId)
          .eq('group_ws_id', wsId)
          .eq('report_approval_status', 'PENDING');
        if (filters?.groupId) query = query.eq('group_id', filters.groupId);
        if (filters?.userId) query = query.eq('user_id', filters.userId);
        if (filters?.creatorId)
          query = query.eq('creator_id', filters.creatorId);
        const { data, error } = await query;
        if (error) throw error;
        for (const report of data ?? []) {
          if (!report.id || !hasReportFeedback(report.feedback)) {
            skippedEmptyCount += 1;
            continue;
          }
          const result = await privateDb
            .from('external_user_monthly_reports')
            .update(reportApprovalUpdate('approve', actorWorkspaceUserId))
            .eq('id', report.id)
            .eq('report_approval_status', 'PENDING')
            .eq('feedback', report.feedback)
            .select('id');
          if (result.error) throw result.error;
          approvedCount += result.data?.length ?? 0;
        }
      } else {
        let query = privateDb
          .from('user_group_post_checks')
          .select(
            'post_id, user_id, user_group_posts!inner(group_id, workspace_user_groups!inner(ws_id))'
          )
          .eq('user_group_posts.workspace_user_groups.ws_id', wsId)
          .eq('approval_status', 'PENDING');
        if (filters?.groupId) {
          query = query.eq('user_group_posts.group_id', filters.groupId);
        }
        if (filters?.userId) query = query.eq('user_id', filters.userId);
        const { data, error } = await query;
        if (error) throw error;

        for (const row of (data ??
          []) as unknown as PostApprovalCheckWithGroup[]) {
          const { error: updateError } = await privateDb
            .from('user_group_post_checks')
            .update(approvalUpdate('approve', actorWorkspaceUserId))
            .eq('post_id', row.post_id)
            .eq('user_id', row.user_id);
          if (updateError) throw updateError;
        }
        approvedPosts = (data ?? []).length > 0;
      }
    } else {
      if (!parsePostApprovalItemId(itemId!)) {
        return NextResponse.json(
          { message: 'Invalid post approval item ID' },
          { status: 400 }
        );
      }
      const postCheck = await getPostCheckInWorkspace(sbAdmin, itemId!, wsId);
      if (!postCheck) {
        return NextResponse.json(
          { message: 'Post approval item not found' },
          { status: 404 }
        );
      }
      if (postCheck.item.approval_status !== 'APPROVED') {
        return NextResponse.json(
          { message: 'Only approved items can remove approval' },
          { status: 409 }
        );
      }
      if (
        await hasPostEmailBeenSent(
          sbAdmin,
          postCheck.parsedItem.postId,
          postCheck.parsedItem.userId
        )
      ) {
        return NextResponse.json(
          {
            message: 'Approval cannot be removed after an email has been sent',
          },
          { status: 409 }
        );
      }
      const { error } = await privateDb
        .from('user_group_post_checks')
        .update(approvalUpdate('unapprove', actorWorkspaceUserId))
        .eq('post_id', postCheck.parsedItem.postId)
        .eq('user_id', postCheck.parsedItem.userId);
      if (error) throw error;
      await cancelQueuedPostEmails(sbAdmin, postCheck.parsedItem.postId, [
        postCheck.parsedItem.userId,
      ]);
    }

    if (approvedPosts && (await shouldQueuePostEmails(permissions, wsId))) {
      await reconcileApprovedPostEmails(sbAdmin, wsId);
    }

    return NextResponse.json({
      success: true,
      ...(kind === 'reports' ? { approvedCount, skippedEmptyCount } : {}),
    });
  } catch (error) {
    if (isReportDeliveryLocked(error))
      return NextResponse.json(
        { message: REPORT_DELIVERY_LOCKED_MESSAGE },
        { status: 409 }
      );
    console.error('Error in Contacts approvals PUT:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
