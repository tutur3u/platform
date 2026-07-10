import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { listPostCheckLogs } from '@/lib/post-check-audit';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    postId: string;
  }>;
}

/**
 * Completion-check history for a post (newest first). Optionally scope to a
 * single member via `?userId=`. Access is gated by the same post-view
 * permission used elsewhere in the group-checks surface.
 */
export async function GET(req: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const { wsId, groupId, postId } = await params;
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') ?? undefined;

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
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

  // Ensure the post belongs to this workspace and group before returning logs.
  const { data: post } = await sbAdmin
    .schema('private')
    .from('user_group_posts')
    .select('id, group_id, workspace_user_groups!inner(ws_id)')
    .eq('id', postId)
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('group_id', groupId)
    .maybeSingle();
  if (!post) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }

  const logs = await listPostCheckLogs(sbAdmin, postId, { userId });
  return NextResponse.json({ logs });
}
