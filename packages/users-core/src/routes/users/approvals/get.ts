import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  type ApprovalRouteActor,
  type ApprovalRouteParams,
  ApprovalSearchParamsSchema,
  buildPostApprovalItemId,
  type PostApprovalQueueRow,
  type PostApprovalRow,
  summarizePostEmailQueue,
} from './shared';

type ReportApprovalRow = {
  approved_at: string | null;
  created_at: string | null;
  creator_full_name: string | null;
  creator_id: string | null;
  feedback: string | null;
  group_id: string | null;
  group_name: string | null;
  id: string;
  modifier_display_name: string | null;
  modifier_email: string | null;
  modifier_full_name: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  report_approval_status: string | null;
  score: number | null;
  scores: unknown;
  title: string | null;
  content: string | null;
  updated_by: string | null;
  user_full_name: string | null;
  user_id: string | null;
};

export async function handleGetApprovalsRequest(
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

    const parsed = ApprovalSearchParamsSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries())
    );
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { creatorId, groupId, kind, limit, page, status, userId } =
      parsed.data;
    if (
      (kind === 'reports' &&
        !permissions.containsPermission('approve_reports')) ||
      (kind === 'posts' && !permissions.containsPermission('approve_posts'))
    ) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient({ noCookie: true });
    const privateDb = sbAdmin.schema('private');
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    if (kind === 'reports') {
      let countQuery = privateDb
        .from('external_user_monthly_reports_workspace_view')
        .select('id', { count: 'exact', head: true })
        .eq('user_ws_id', wsId);
      let dataQuery = privateDb
        .from('external_user_monthly_reports_workspace_view')
        .select(
          'id, title, content, feedback, score, scores, created_at, updated_by, user_id, group_id, creator_id, report_approval_status, rejection_reason, approved_at, rejected_at, modifier_display_name, modifier_full_name, modifier_email, creator_full_name, user_full_name, group_name'
        )
        .eq('user_ws_id', wsId);

      if (groupId) {
        countQuery = countQuery.eq('group_id', groupId);
        dataQuery = dataQuery.eq('group_id', groupId);
      }
      if (userId) {
        countQuery = countQuery.eq('user_id', userId);
        dataQuery = dataQuery.eq('user_id', userId);
      }
      if (creatorId) {
        countQuery = countQuery.eq('creator_id', creatorId);
        dataQuery = dataQuery.eq('creator_id', creatorId);
      }
      if (status !== 'all') {
        const approvalStatus = status.toUpperCase() as
          | 'PENDING'
          | 'APPROVED'
          | 'REJECTED';
        countQuery = countQuery.eq('report_approval_status', approvalStatus);
        dataQuery = dataQuery.eq('report_approval_status', approvalStatus);
      }

      const [{ count, error: countError }, { data, error }] = await Promise.all(
        [
          countQuery,
          dataQuery.order('updated_at', { ascending: false }).range(from, to),
        ]
      );
      if (countError) throw countError;
      if (error) throw error;

      const rows = (data ?? []) as unknown as ReportApprovalRow[];
      return NextResponse.json({
        items: rows.map((row) => ({
          ...row,
          creator_name: row.creator_full_name,
          modifier_name:
            row.modifier_display_name ||
            row.modifier_full_name ||
            row.modifier_email ||
            row.creator_full_name ||
            null,
          user_name: row.user_full_name,
        })),
        totalCount: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      });
    }

    let countQuery = privateDb
      .from('user_group_post_checks')
      .select(
        'post_id, user_id, user_group_posts!inner(group_id, workspace_user_groups!inner(ws_id))',
        { count: 'exact', head: true }
      )
      .eq('user_group_posts.workspace_user_groups.ws_id', wsId);
    let dataQuery = privateDb
      .from('user_group_post_checks')
      .select(
        'post_id, user_id, notes, is_completed, approval_status, rejection_reason, approved_at, rejected_at, approved_by, post:user_group_posts!inner(id, title, content, notes, created_at, updated_by, group_id, modifier:workspace_users!updated_by(display_name, full_name, email), workspace_user_groups!inner(name, ws_id)), user:workspace_users!user_id!inner(full_name, display_name, email)'
      )
      .eq('post.workspace_user_groups.ws_id', wsId);

    if (groupId) {
      countQuery = countQuery.eq('user_group_posts.group_id', groupId);
      dataQuery = dataQuery.eq('post.group_id', groupId);
    }
    if (userId) {
      countQuery = countQuery.eq('user_id', userId);
      dataQuery = dataQuery.eq('user_id', userId);
    }
    if (status !== 'all') {
      const approvalStatus = status.toUpperCase() as
        | 'PENDING'
        | 'APPROVED'
        | 'REJECTED';
      countQuery = countQuery.eq('approval_status', approvalStatus);
      dataQuery = dataQuery.eq('approval_status', approvalStatus);
    }

    const [{ count, error: countError }, { data, error }] = await Promise.all([
      countQuery,
      dataQuery
        .order('approved_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to),
    ]);
    if (countError) throw countError;
    if (error) throw error;

    const rows = (data ?? []) as unknown as PostApprovalRow[];
    const postIds = [...new Set(rows.map((row) => row.post_id))];
    const userIds = new Set(rows.map((row) => row.user_id));
    const [
      { data: queueData, error: queueError },
      { data: sentData, error: sentError },
    ] =
      postIds.length === 0
        ? [
            { data: [], error: null },
            { data: [], error: null },
          ]
        : await Promise.all([
            sbAdmin
              .from('post_email_queue')
              .select('post_id, user_id, status')
              .in('post_id', postIds),
            sbAdmin
              .from('sent_emails')
              .select('post_id, receiver_id')
              .in('post_id', postIds),
          ]);
    if (queueError) throw queueError;
    if (sentError) throw sentError;

    const queueByItem = new Map<string, PostApprovalQueueRow>();
    for (const row of (queueData ?? []) as PostApprovalQueueRow[]) {
      queueByItem.set(buildPostApprovalItemId(row.post_id, row.user_id), row);
    }
    const sentItemIds = new Set(
      (sentData ?? [])
        .filter((row) => Boolean(row.post_id) && userIds.has(row.receiver_id))
        .map((row) => buildPostApprovalItemId(row.post_id!, row.receiver_id))
    );

    return NextResponse.json({
      items: rows.map((row) => {
        const itemId = buildPostApprovalItemId(row.post_id, row.user_id);
        const queueRow = queueByItem.get(itemId);
        return {
          approved_at: row.approved_at,
          can_remove_approval:
            row.approval_status === 'APPROVED' &&
            !sentItemIds.has(itemId) &&
            queueRow?.status !== 'sent',
          content: row.post?.content,
          created_at: row.post?.created_at,
          group_id: row.post?.group_id,
          group_name: row.post?.workspace_user_groups?.name,
          id: itemId,
          is_completed: row.is_completed,
          modifier_name:
            row.post?.modifier?.display_name ||
            row.post?.modifier?.full_name ||
            row.post?.modifier?.email ||
            null,
          notes: row.notes ?? row.post?.notes ?? null,
          post_approval_status: row.approval_status,
          post_id: row.post_id,
          queue_counts: summarizePostEmailQueue(queueRow ? [queueRow] : []),
          rejected_at: row.rejected_at,
          rejection_reason: row.rejection_reason,
          title: row.post?.title,
          updated_by: row.post?.updated_by,
          user_id: row.user_id,
          user_name:
            row.user?.full_name || row.user?.display_name || row.user?.email,
        };
      }),
      totalCount: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (error) {
    console.error('Error in Contacts approvals GET:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
