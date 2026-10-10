import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  cancelQueuedPostEmails,
  enqueueApprovedPostEmails,
  hasPostEmailBeenSent,
} from '@/lib/post-email-queue';
import { resolvePostEmailEnqueueAccess } from '@/lib/post-email-queue/enqueue-access';
import {
  type ApprovalStatus,
  buildPostApprovalItemId,
  MutationSchema,
  type Params,
  type PostApprovalCheckWithGroup,
  parsePostApprovalItemId,
} from './shared';

export async function PUT(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const supabase = await createClient(request);
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
    let postEmailEnqueueAccessPromise: ReturnType<
      typeof resolvePostEmailEnqueueAccess
    > | null = null;
    const getPostEmailEnqueueAccess = () => {
      postEmailEnqueueAccessPromise ??= resolvePostEmailEnqueueAccess({
        permissions,
        wsId,
      });
      return postEmailEnqueueAccessPromise;
    };

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
        const { data: report, error: fetchError } = await privateDb
          .from('external_user_monthly_reports_workspace_view')
          .select('id')
          .eq('id', itemId)
          .eq('user_ws_id', wsId)
          .eq('group_ws_id', wsId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!report) {
          return NextResponse.json(
            { message: 'Report not found' },
            { status: 404 }
          );
        }

        const { error } = await privateDb
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
          .schema('private')
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
        const checkWithGroup = check as unknown as PostApprovalCheckWithGroup;

        const { error } = await sbAdmin
          .schema('private')
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

        if ((await getPostEmailEnqueueAccess()).allowed) {
          await enqueueApprovedPostEmails(sbAdmin, {
            wsId,
            postId: parsedItem.postId,
            groupId: checkWithGroup.user_group_posts?.group_id ?? undefined,
            senderPlatformUserId: user.id,
            userIds: [parsedItem.userId],
          });
        }
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
        const { data: report, error: fetchError } = await privateDb
          .from('external_user_monthly_reports_workspace_view')
          .select('id')
          .eq('id', itemId)
          .eq('user_ws_id', wsId)
          .eq('group_ws_id', wsId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!report) {
          return NextResponse.json(
            { message: 'Report not found' },
            { status: 404 }
          );
        }

        const { error } = await privateDb
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
          .schema('private')
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
          .schema('private')
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
        let q = privateDb
          .from('external_user_monthly_reports_workspace_view')
          .select('id')
          .eq('user_ws_id', wsId)
          .eq('group_ws_id', wsId)
          .eq('report_approval_status', 'PENDING');

        if (filters?.groupId) q = q.eq('group_id', filters.groupId);
        if (filters?.userId) q = q.eq('user_id', filters.userId);
        if (filters?.creatorId) q = q.eq('creator_id', filters.creatorId);

        const { data, error } = await q;
        if (error) throw error;
        allPendingIds = (data ?? [])
          .map((item) => item.id)
          .filter((id): id is string => typeof id === 'string');
      } else {
        let q = sbAdmin
          .schema('private')
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
        const pendingRows = (data ??
          []) as unknown as PostApprovalCheckWithGroup[];
        allPendingIds = pendingRows.map((item) =>
          buildPostApprovalItemId(item.post_id, item.user_id)
        );
        pendingPostGroups.push(
          ...pendingRows.flatMap((item) => {
            const groupId = item.user_group_posts?.group_id;
            if (!groupId) return [];
            return [
              {
                post_id: item.post_id,
                group_id: groupId,
                user_id: item.user_id,
              },
            ];
          })
        );
      }

      if (allPendingIds.length > 0) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < allPendingIds.length; i += BATCH_SIZE) {
          const batch = allPendingIds.slice(i, i + BATCH_SIZE);
          if (kind === 'reports') {
            const { error } = await privateDb
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
                .schema('private')
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
          if ((await getPostEmailEnqueueAccess()).allowed) {
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
        .schema('private')
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
        .schema('private')
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
