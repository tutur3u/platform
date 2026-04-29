import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MAX_APPROVAL_REJECTION_REASON_LENGTH } from '@/features/reports/report-limits';
import {
  cancelQueuedPostEmails,
  enqueueApprovedPostEmails,
  getPostEmailQueueRows,
  hasPostEmailBeenSent,
  summarizePostEmailQueue,
} from '@/lib/post-email-queue';

type ApprovalStatus = Database['public']['Enums']['approval_status'];

function buildPostApprovalItemId(postId: string, userId: string) {
  return `${postId}:${userId}`;
}

function parsePostApprovalItemId(itemId: string) {
  const [postId, userId] = itemId.split(':');
  if (!postId || !userId) {
    return null;
  }

  return { postId, userId };
}

const SearchParamsSchema = z.object({
  kind: z.enum(['reports', 'posts']),
  status: z.enum(['all', 'pending', 'approved', 'rejected']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  groupId: z.string().optional(),
  userId: z.string().optional(),
  creatorId: z.string().optional(),
});

const MutationSchema = z.object({
  action: z.enum(['approve', 'reject', 'approveAll', 'unapprove']),
  kind: z.enum(['reports', 'posts']),
  itemId: z.string().optional(),
  reason: z.string().max(MAX_APPROVAL_REJECTION_REASON_LENGTH).optional(),
  filters: z
    .object({
      groupId: z.string().optional(),
      userId: z.string().optional(),
      creatorId: z.string().optional(),
    })
    .optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const sbAdmin = await createAdminClient();

    const wsId = await normalizeWorkspaceId(id);

    // Check permissions
    const permissions = await getPermissions({ wsId, request });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { containsPermission } = permissions;
    const canApproveReports = containsPermission('approve_reports');
    const canApprovePosts = containsPermission('send_user_group_post_emails');

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
      let countQuery = sbAdmin
        .from('external_user_monthly_reports')
        .select('id, user:workspace_users!user_id!inner(ws_id)', {
          count: 'exact',
          head: true,
        })
        .eq('user.ws_id', wsId);

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

      let dataQuery = sbAdmin
        .from('external_user_monthly_reports')
        .select(
          'id, title, content, feedback, score, scores, created_at, updated_by, user_id, group_id, creator_id, report_approval_status, rejection_reason, approved_at, rejected_at, modifier:workspace_users!updated_by(display_name, full_name, email), creator:workspace_users!creator_id(full_name), user:workspace_users!user_id!inner(full_name, ws_id), ...workspace_user_groups(group_name:name)'
        )
        .eq('user.ws_id', wsId);

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

      const items = (data ?? []).map((row) => {
        const user = row.user as unknown as
          | { full_name: string | null }
          | { full_name: string | null }[];
        const userName = Array.isArray(user)
          ? user?.[0]?.full_name
          : user?.full_name;

        const modifier = row.modifier as unknown as {
          display_name: string | null;
          full_name: string | null;
          email: string | null;
        } | null;

        const creator = row.creator as unknown as {
          full_name: string | null;
        } | null;

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
          user_name: userName,
          modifier_name:
            modifier?.display_name ||
            modifier?.full_name ||
            modifier?.email ||
            creator?.full_name ||
            null,
          creator_name: creator?.full_name,
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

      const postIds = (data ?? []).map((row) => row.post_id);
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

      const recipientPairs = (data ?? []).map((row) => ({
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

      const items = (data ?? []).map((row) => {
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

export async function PUT(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    const wsId = await normalizeWorkspaceId(id);

    // Check permissions
    const permissions = await getPermissions({ wsId, request });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { containsPermission } = permissions;
    const canApproveReports = containsPermission('approve_reports');
    const canApprovePosts = containsPermission('send_user_group_post_emails');

    const body = await request.json();
    const parsed = MutationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { action, kind, itemId, reason, filters } = parsed.data;

    if (kind === 'reports' && !canApproveReports) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    if (kind === 'posts' && !canApprovePosts) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const { user } = await resolveAuthenticatedSessionUser(supabase);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: workspaceUser, error: workspaceUserError } = await sbAdmin
      .from('workspace_user_linked_users')
      .select('virtual_user_id')
      .eq('platform_user_id', user.id)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (workspaceUserError || !workspaceUser?.virtual_user_id) {
      return NextResponse.json(
        { message: 'User not found in workspace' },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
      if (!itemId)
        return NextResponse.json(
          { message: 'Item ID is required' },
          { status: 400 }
        );

      if (kind === 'reports') {
        const { data: report, error: fetchError } = await sbAdmin
          .from('external_user_monthly_reports')
          .select('id, user:workspace_users!user_id!inner(ws_id)')
          .eq('id', itemId)
          .eq('user.ws_id', wsId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!report) {
          return NextResponse.json(
            { message: 'Report not found' },
            { status: 404 }
          );
        }

        const { error } = await sbAdmin
          .from('external_user_monthly_reports')
          .update({
            report_approval_status: 'APPROVED' as ApprovalStatus,
            approved_by: workspaceUser.virtual_user_id,
            approved_at: now,
            rejected_by: null,
            rejected_at: null,
            rejection_reason: null,
          })
          .eq('id', itemId);
        if (error) throw error;
      } else {
        const parsedItem = parsePostApprovalItemId(itemId);
        if (!parsedItem) {
          return NextResponse.json(
            { message: 'Invalid post approval item ID' },
            { status: 400 }
          );
        }

        const { data: check, error: fetchError } = await sbAdmin
          .from('user_group_post_checks')
          .select(
            'post_id, user_id, approval_status, user_group_posts!inner(group_id, workspace_user_groups!inner(ws_id))'
          )
          .eq('post_id', parsedItem.postId)
          .eq('user_id', parsedItem.userId)
          .eq('user_group_posts.workspace_user_groups.ws_id', wsId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!check) {
          return NextResponse.json(
            { message: 'Post approval item not found' },
            { status: 404 }
          );
        }

        const { error } = await sbAdmin
          .from('user_group_post_checks')
          .update({
            approval_status: 'APPROVED' as ApprovalStatus,
            approved_by: workspaceUser.virtual_user_id,
            approved_at: now,
            rejected_by: null,
            rejected_at: null,
            rejection_reason: null,
          })
          .eq('post_id', parsedItem.postId)
          .eq('user_id', parsedItem.userId);
        if (error) throw error;

        await enqueueApprovedPostEmails(sbAdmin, {
          wsId,
          postId: parsedItem.postId,
          groupId: check.user_group_posts?.group_id,
          senderPlatformUserId: user.id,
          userIds: [parsedItem.userId],
        });
      }
    } else if (action === 'reject') {
      if (!itemId)
        return NextResponse.json(
          { message: 'Item ID is required' },
          { status: 400 }
        );

      if (!reason?.trim()) {
        return NextResponse.json(
          { message: 'Rejection reason is required' },
          { status: 400 }
        );
      }

      if (kind === 'reports') {
        const { data: report, error: fetchError } = await sbAdmin
          .from('external_user_monthly_reports')
          .select('id, user:workspace_users!user_id!inner(ws_id)')
          .eq('id', itemId)
          .eq('user.ws_id', wsId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!report) {
          return NextResponse.json(
            { message: 'Report not found' },
            { status: 404 }
          );
        }

        const { error } = await sbAdmin
          .from('external_user_monthly_reports')
          .update({
            report_approval_status: 'REJECTED' as ApprovalStatus,
            rejected_by: workspaceUser.virtual_user_id,
            rejected_at: now,
            rejection_reason: reason.trim(),
            approved_by: null,
            approved_at: null,
          })
          .eq('id', itemId);
        if (error) throw error;
      } else {
        const parsedItem = parsePostApprovalItemId(itemId);
        if (!parsedItem) {
          return NextResponse.json(
            { message: 'Invalid post approval item ID' },
            { status: 400 }
          );
        }

        const { data: check, error: fetchError } = await sbAdmin
          .from('user_group_post_checks')
          .select(
            'post_id, user_id, user_group_posts!inner(workspace_user_groups!inner(ws_id))'
          )
          .eq('post_id', parsedItem.postId)
          .eq('user_id', parsedItem.userId)
          .eq('user_group_posts.workspace_user_groups.ws_id', wsId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!check) {
          return NextResponse.json(
            { message: 'Post approval item not found' },
            { status: 404 }
          );
        }

        const { error } = await sbAdmin
          .from('user_group_post_checks')
          .update({
            approval_status: 'REJECTED' as ApprovalStatus,
            rejected_by: workspaceUser.virtual_user_id,
            rejected_at: now,
            rejection_reason: reason.trim(),
            approved_by: null,
            approved_at: null,
          })
          .eq('post_id', parsedItem.postId)
          .eq('user_id', parsedItem.userId);
        if (error) throw error;

        await cancelQueuedPostEmails(sbAdmin, parsedItem.postId, [
          parsedItem.userId,
        ]);
      }
    } else if (action === 'approveAll') {
      let allPendingIds: string[] = [];
      const pendingPostGroups: Array<{
        post_id: string;
        group_id: string;
        user_id: string;
      }> = [];

      if (kind === 'reports') {
        let q = sbAdmin
          .from('external_user_monthly_reports')
          .select('id, user:workspace_users!user_id!inner(ws_id)')
          .eq('user.ws_id', wsId)
          .eq('report_approval_status', 'PENDING');

        if (filters?.groupId) q = q.eq('group_id', filters.groupId);
        if (filters?.userId) q = q.eq('user_id', filters.userId);
        if (filters?.creatorId) q = q.eq('creator_id', filters.creatorId);

        const { data, error } = await q;
        if (error) throw error;
        allPendingIds = (data ?? []).map((item) => item.id);
      } else {
        let q = sbAdmin
          .from('user_group_post_checks')
          .select(
            'post_id, user_id, user_group_posts!inner(group_id, workspace_user_groups!inner(ws_id))'
          )
          .eq('user_group_posts.workspace_user_groups.ws_id', wsId)
          .eq('approval_status', 'PENDING');

        if (filters?.groupId)
          q = q.eq('user_group_posts.group_id', filters.groupId);
        if (filters?.userId) q = q.eq('user_id', filters.userId);

        const { data, error } = await q;
        if (error) throw error;
        allPendingIds = (data ?? []).map((item) =>
          buildPostApprovalItemId(item.post_id, item.user_id)
        );
        pendingPostGroups.push(
          ...(data ?? []).map((item) => ({
            post_id: item.post_id,
            group_id: item.user_group_posts.group_id,
            user_id: item.user_id,
          }))
        );
      }

      if (allPendingIds.length > 0) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < allPendingIds.length; i += BATCH_SIZE) {
          const batch = allPendingIds.slice(i, i + BATCH_SIZE);
          if (kind === 'reports') {
            const { error } = await sbAdmin
              .from('external_user_monthly_reports')
              .update({
                report_approval_status: 'APPROVED' as ApprovalStatus,
                approved_by: workspaceUser.virtual_user_id,
                approved_at: now,
                rejected_by: null,
                rejected_at: null,
                rejection_reason: null,
              })
              .in('id', batch);
            if (error) throw error;
          } else {
            const parsedBatch = batch
              .map((value) => parsePostApprovalItemId(value))
              .filter(Boolean);
            for (const item of parsedBatch) {
              const { error } = await sbAdmin
                .from('user_group_post_checks')
                .update({
                  approval_status: 'APPROVED' as ApprovalStatus,
                  approved_by: workspaceUser.virtual_user_id,
                  approved_at: now,
                  rejected_by: null,
                  rejected_at: null,
                  rejection_reason: null,
                })
                .eq('post_id', item!.postId)
                .eq('user_id', item!.userId);
              if (error) throw error;
            }
          }
        }

        if (kind === 'posts') {
          for (const post of pendingPostGroups) {
            await enqueueApprovedPostEmails(sbAdmin, {
              wsId,
              postId: post.post_id,
              groupId: post.group_id,
              senderPlatformUserId: user.id,
              userIds: [post.user_id],
            });
          }
        }
      }
    } else if (action === 'unapprove') {
      if (kind !== 'posts') {
        return NextResponse.json(
          { message: 'Unapprove is only supported for posts' },
          { status: 400 }
        );
      }

      if (!itemId) {
        return NextResponse.json(
          { message: 'Item ID is required' },
          { status: 400 }
        );
      }

      const parsedItem = parsePostApprovalItemId(itemId);
      if (!parsedItem) {
        return NextResponse.json(
          { message: 'Invalid post approval item ID' },
          { status: 400 }
        );
      }

      const { data: check, error: fetchError } = await sbAdmin
        .from('user_group_post_checks')
        .select(
          'post_id, user_id, approval_status, user_group_posts!inner(workspace_user_groups!inner(ws_id))'
        )
        .eq('post_id', parsedItem.postId)
        .eq('user_id', parsedItem.userId)
        .eq('user_group_posts.workspace_user_groups.ws_id', wsId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!check) {
        return NextResponse.json(
          { message: 'Post approval item not found' },
          { status: 404 }
        );
      }

      if (check.approval_status !== 'APPROVED') {
        return NextResponse.json(
          { message: 'Only approved items can remove approval' },
          { status: 409 }
        );
      }

      const alreadySent = await hasPostEmailBeenSent(
        sbAdmin,
        parsedItem.postId,
        parsedItem.userId
      );
      if (alreadySent) {
        return NextResponse.json(
          {
            message: 'Approval cannot be removed after an email has been sent',
          },
          { status: 409 }
        );
      }

      const { error } = await sbAdmin
        .from('user_group_post_checks')
        .update({
          approval_status: 'PENDING' as ApprovalStatus,
          approved_by: null,
          approved_at: null,
          rejected_by: null,
          rejected_at: null,
          rejection_reason: null,
        })
        .eq('post_id', parsedItem.postId)
        .eq('user_id', parsedItem.userId);

      if (error) throw error;

      await cancelQueuedPostEmails(sbAdmin, parsedItem.postId, [
        parsedItem.userId,
      ]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in approvals PUT:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
