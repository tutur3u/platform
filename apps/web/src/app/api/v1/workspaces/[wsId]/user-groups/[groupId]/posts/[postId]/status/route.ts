import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

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
      '...workspace_users(id, user_group_post_checks!inner(post_id, is_completed))',
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

  const { count: emailsCount, error: emailsError } = await sbAdmin
    .from('sent_emails')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('post_id', postId);

  if (emailsError) {
    console.error(emailsError);
    return NextResponse.json(
      { message: 'Error fetching sent emails' },
      { status: 500 }
    );
  }

  const safeUsers = (users || []) as Array<{
    id: string | null;
    user_group_post_checks?: Array<{
      post_id: string;
      is_completed: boolean | null;
    }> | null;
  }>;

  return NextResponse.json({
    sent: emailsCount || 0,
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
  });
}
