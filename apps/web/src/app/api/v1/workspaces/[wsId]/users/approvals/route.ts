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

type ApprovalStatus = Database['public']['Enums']['approval_status'];

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
  action: z.enum(['approve', 'reject', 'approveAll']),
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
        .from('user_group_posts')
        .select('id, workspace_user_groups!inner(ws_id)', {
          count: 'exact',
          head: true,
        })
        .eq('workspace_user_groups.ws_id', wsId);

      if (groupId) countQuery = countQuery.eq('group_id', groupId);
      if (status !== 'all') {
        countQuery = countQuery.eq(
          'post_approval_status',
          status.toUpperCase() as ApprovalStatus
        );
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      let dataQuery = sbAdmin
        .from('user_group_posts')
        .select(
          'id, title, content, notes, created_at, updated_by, post_approval_status, rejection_reason, approved_at, rejected_at, group_id, modifier:workspace_users!updated_by(display_name, full_name, email), ...workspace_user_groups(group_name:name, ws_id)'
        )
        .eq('workspace_user_groups.ws_id', wsId);

      if (groupId) dataQuery = dataQuery.eq('group_id', groupId);
      if (status !== 'all') {
        dataQuery = dataQuery.eq(
          'post_approval_status',
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

      const items = (data ?? []).map((row) => {
        const modifier = row.modifier as unknown as {
          display_name: string | null;
          full_name: string | null;
          email: string | null;
        } | null;

        return {
          ...row,
          group_name: row.group_name,
          modifier_name:
            modifier?.display_name ||
            modifier?.full_name ||
            modifier?.email ||
            null,
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
    const canApprovePosts = containsPermission('approve_posts');

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

    const {
      data: { user },
    } = await supabase.auth.getUser();
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
        const { data: post, error: fetchError } = await sbAdmin
          .from('user_group_posts')
          .select('id, workspace_user_groups!inner(ws_id)')
          .eq('id', itemId)
          .eq('workspace_user_groups.ws_id', wsId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!post) {
          return NextResponse.json(
            { message: 'Post not found' },
            { status: 404 }
          );
        }

        const { error } = await sbAdmin
          .from('user_group_posts')
          .update({
            post_approval_status: 'APPROVED' as ApprovalStatus,
            approved_by: workspaceUser.virtual_user_id,
            approved_at: now,
            rejected_by: null,
            rejected_at: null,
            rejection_reason: null,
          })
          .eq('id', itemId);
        if (error) throw error;
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
        const { data: post, error: fetchError } = await sbAdmin
          .from('user_group_posts')
          .select('id, workspace_user_groups!inner(ws_id)')
          .eq('id', itemId)
          .eq('workspace_user_groups.ws_id', wsId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!post) {
          return NextResponse.json(
            { message: 'Post not found' },
            { status: 404 }
          );
        }

        const { error } = await sbAdmin
          .from('user_group_posts')
          .update({
            post_approval_status: 'REJECTED' as ApprovalStatus,
            rejected_by: workspaceUser.virtual_user_id,
            rejected_at: now,
            rejection_reason: reason.trim(),
            approved_by: null,
            approved_at: null,
          })
          .eq('id', itemId);
        if (error) throw error;
      }
    } else if (action === 'approveAll') {
      let allPendingIds: string[] = [];

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
          .from('user_group_posts')
          .select('id, workspace_user_groups!inner(ws_id)')
          .eq('workspace_user_groups.ws_id', wsId)
          .eq('post_approval_status', 'PENDING');

        if (filters?.groupId) q = q.eq('group_id', filters.groupId);

        const { data, error } = await q;
        if (error) throw error;
        allPendingIds = (data ?? []).map((item) => item.id);
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
            const { error } = await sbAdmin
              .from('user_group_posts')
              .update({
                post_approval_status: 'APPROVED' as ApprovalStatus,
                approved_by: workspaceUser.virtual_user_id,
                approved_at: now,
                rejected_by: null,
                rejected_at: null,
                rejection_reason: null,
              })
              .in('id', batch);
            if (error) throw error;
          }
        }
      }
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
