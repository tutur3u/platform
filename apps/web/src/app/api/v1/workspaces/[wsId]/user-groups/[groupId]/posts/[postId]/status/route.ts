import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  getPostEmailQueueRows,
  hasPostEmailBeenSent,
  summarizePostEmailQueue,
} from '@/lib/post-email-queue';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    postId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId, postId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user group posts' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();

  const {
    data: users,
    count,
    error: usersError,
  } = await sbAdmin
    .from('workspace_user_groups_users')
    .select(
      '...workspace_users(id, user_group_post_checks!user_id!inner(post_id, is_completed))',
      {
        count: 'exact',
      }
    )
    .eq('group_id', groupId)
    .eq('workspace_users.user_group_post_checks.post_id', postId);

  if (usersError) {
    console.error(usersError);
    return NextResponse.json(
      { message: 'Error fetching group members' },
      { status: 500 }
    );
  }

  const queueRows = await getPostEmailQueueRows(sbAdmin, [postId]);
  const queueSummary = summarizePostEmailQueue(queueRows);
  const canRemoveApproval = !(await hasPostEmailBeenSent(sbAdmin, postId));

  const safeUsers = (users || []) as Array<{
    id: string | null;
    user_group_post_checks?: Array<{
      post_id: string;
      is_completed: boolean | null;
    }> | null;
  }>;

  return NextResponse.json({
    sent: queueSummary.sent,
    checked: safeUsers.filter((user) =>
      user?.user_group_post_checks?.find((check) => check?.is_completed)
    ).length,
    failed: safeUsers.filter((user) =>
      user?.user_group_post_checks?.find(
        (check) => check?.is_completed === false
      )
    ).length,
    tentative: safeUsers.filter((user) => !user?.id).length,
    count: count || 0,
    queue: queueSummary,
    can_remove_approval: canRemoveApproval,
  });
}
