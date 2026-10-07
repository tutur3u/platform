import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  getPostEmailQueueRows,
  summarizePostEmailQueue,
} from '@/lib/post-email-queue';
import {
  type ApprovalStatus,
  buildPostApprovalItemId,
  type Params,
  type PostApprovalRow,
  SearchParamsSchema,
} from './shared';

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');

    const wsId = await normalizeWorkspaceId(id);

    // Check permissions
    const permissions = await getPermissions({ wsId, request });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { containsPermission } = permissions;
    const canApproveReports = containsPermission('approve_reports');
    const canApprovePosts = containsPermission('approve_posts');

    const { searchParams } = new URL(request.url);
    const parsed = SearchParamsSchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { kind, status, page, limit, groupId, userId, creatorId } =
      parsed.data;

    if (kind === 'reports' && !canApproveReports) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    if (kind === 'posts' && !canApprovePosts) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    if (kind === 'reports') {
      let countQuery = privateDb
        .from('external_user_monthly_reports_workspace_view')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('user_ws_id', wsId)
        .eq('group_ws_id', wsId);

      if (groupId) countQuery = countQuery.eq('group_id', groupId);
      if (userId) countQuery = countQuery.eq('user_id', userId);
      if (creatorId) countQuery = countQuery.eq('creator_id', creatorId);
      if (status !== 'all') {
        countQuery = countQuery.eq(
          'report_approval_status',
          status.toUpperCase() as ApprovalStatus
        );
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      let dataQuery = privateDb
        .from('external_user_monthly_reports_workspace_view')
        .select(
          'id, title, content, feedback, score, scores, created_at, updated_by, user_id, group_id, creator_id, report_approval_status, rejection_reason, approved_at, rejected_at, modifier_display_name, modifier_full_name, modifier_email, creator_full_name, user_full_name, group_name'
        )
        .eq('user_ws_id', wsId)
        .eq('group_ws_id', wsId);

      if (groupId) dataQuery = dataQuery.eq('group_id', groupId);
      if (userId) dataQuery = dataQuery.eq('user_id', userId);
      if (creatorId) dataQuery = dataQuery.eq('creator_id', creatorId);
      if (status !== 'all') {
        dataQuery = dataQuery.eq(
          'report_approval_status',
          status.toUpperCase() as ApprovalStatus
        );
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, error } = await dataQuery
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<Record<string, any>>;
      const items = rows.map((row) => {
        return {
          id: row.id,
          title: row.title,
          content: row.content,
          feedback: row.feedback,
          score: row.score,
          scores: row.scores,
          created_at: row.created_at,
          updated_by: row.updated_by,
          user_id: row.user_id,
          group_id: row.group_id,
          creator_id: row.creator_id,
          report_approval_status: row.report_approval_status,
          rejection_reason: row.rejection_reason,
          approved_at: row.approved_at,
          rejected_at: row.rejected_at,
          group_name: row.group_name,
          user_name: row.user_full_name,
          modifier_name:
            row.modifier_display_name ||
            row.modifier_full_name ||
            row.modifier_email ||
            row.creator_full_name ||
            null,
          creator_name: row.creator_full_name,
        };
      });

      return NextResponse.json({
        items,
        totalCount: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      });
    } else {
      // Posts
      let countQuery = sbAdmin
        .schema('private')
        .from('user_group_post_checks')
        .select(
          'post_id, user_id, user_group_posts!inner(group_id, workspace_user_groups!inner(ws_id))',
          {
            count: 'exact',
            head: true,
          }
        )
        .eq('user_group_posts.workspace_user_groups.ws_id', wsId);

      if (groupId)
        countQuery = countQuery.eq('user_group_posts.group_id', groupId);
      if (userId) countQuery = countQuery.eq('user_id', userId);
      if (status !== 'all') {
        countQuery = countQuery.eq(
          'approval_status',
          status.toUpperCase() as ApprovalStatus
        );
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      let dataQuery = sbAdmin
        .schema('private')
        .from('user_group_post_checks')
        .select(
          'post_id, user_id, notes, is_completed, approval_status, rejection_reason, approved_at, rejected_at, approved_by, post:user_group_posts!inner(id, title, content, notes, created_at, updated_by, group_id, modifier:workspace_users!updated_by(display_name, full_name, email), workspace_user_groups!inner(name, ws_id)), user:workspace_users!user_id!inner(full_name, display_name, email)'
        )
        .eq('post.workspace_user_groups.ws_id', wsId);

      if (groupId) dataQuery = dataQuery.eq('post.group_id', groupId);
      if (userId) dataQuery = dataQuery.eq('user_id', userId);
      if (status !== 'all') {
        dataQuery = dataQuery.eq(
          'approval_status',
          status.toUpperCase() as ApprovalStatus
        );
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, error } = await dataQuery
        .order('approved_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const postApprovalRows = (data ?? []) as unknown as PostApprovalRow[];
      const postIds = postApprovalRows.map((row) => row.post_id);
      const queueRows = await getPostEmailQueueRows(sbAdmin, postIds);
      const queueRowsByRecipient = new Map<
        string,
        (typeof queueRows)[number]
      >();

      for (const row of queueRows) {
        queueRowsByRecipient.set(
          buildPostApprovalItemId(row.post_id, row.user_id),
          row
        );
      }

      const recipientPairs = postApprovalRows.map((row) => ({
        postId: row.post_id,
        userId: row.user_id,
      }));
      const uniqueUserIds = [
        ...new Set(recipientPairs.map((pair) => pair.userId).filter(Boolean)),
      ];

      const { data: sentEmails, error: sentEmailsError } =
        postIds.length === 0 || uniqueUserIds.length === 0
          ? { data: [], error: null }
          : await sbAdmin
              .from('sent_emails')
              .select('post_id, receiver_id')
              .in('post_id', postIds);

      if (sentEmailsError) throw sentEmailsError;

      const sentRecipientIds = new Set(
        (sentEmails ?? [])
          .filter(
            (row) =>
              uniqueUserIds.includes(row.receiver_id) && Boolean(row.post_id)
          )
          .map((row) => buildPostApprovalItemId(row.post_id!, row.receiver_id))
      );

      const items = postApprovalRows.map((row) => {
        const modifier = row.post?.modifier as unknown as {
          display_name: string | null;
          full_name: string | null;
          email: string | null;
        } | null;
        const itemId = buildPostApprovalItemId(row.post_id, row.user_id);
        const queueRow = queueRowsByRecipient.get(itemId);
        const canRemoveApproval =
          row.approval_status === 'APPROVED' &&
          !sentRecipientIds.has(itemId) &&
          queueRow?.status !== 'sent';
        const userName =
          row.user?.full_name || row.user?.display_name || row.user?.email;

        return {
          id: itemId,
          title: row.post?.title,
          content: row.post?.content,
          notes: row.notes ?? row.post?.notes ?? null,
          created_at: row.post?.created_at,
          updated_by: row.post?.updated_by,
          post_approval_status: row.approval_status,
          rejection_reason: row.rejection_reason,
          approved_at: row.approved_at,
          rejected_at: row.rejected_at,
          group_id: row.post?.group_id,
          group_name: row.post?.workspace_user_groups?.name,
          user_id: row.user_id,
          user_name: userName,
          post_id: row.post_id,
          is_completed: row.is_completed,
          modifier_name:
            modifier?.display_name ||
            modifier?.full_name ||
            modifier?.email ||
            null,
          can_remove_approval: canRemoveApproval,
          queue_counts: summarizePostEmailQueue(queueRow ? [queueRow] : []),
        };
      });

      return NextResponse.json({
        items,
        totalCount: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      });
    }
  } catch (error) {
    console.error('Error in approvals GET:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
