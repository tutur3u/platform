import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { listPostCheckLogs } from '../../../../../../lib/post-check-audit';
import { getUserGroupRoutePermissions } from '../../../../../../lib/user-groups/route-auth';
import {
  hasUserGroupPostInWorkspace,
  resolveUserGroupRouteWorkspaceId,
} from '../../../../../../lib/user-groups/route-helpers';

interface Params {
  params: Promise<{ groupId: string; postId: string; wsId: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const { groupId, postId, wsId: rawWsId } = await params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, req);
  const permissions = await getUserGroupRoutePermissions(wsId, req);

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (
    permissions.withoutPermission('view_user_groups_posts') &&
    permissions.withoutPermission('update_user_groups_posts')
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user group posts' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  try {
    const exists = await hasUserGroupPostInWorkspace({
      groupId,
      postId,
      sbAdmin,
      wsId,
    });
    if (!exists) {
      return NextResponse.json({ message: 'Post not found' }, { status: 404 });
    }

    const userId = new URL(req.url).searchParams.get('userId') ?? undefined;
    const logs = await listPostCheckLogs(sbAdmin, postId, { userId });
    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Error loading group-check history', {
      error,
      groupId,
      postId,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error loading completion history' },
      { status: 500 }
    );
  }
}
