import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

type RouteContext = { params: Promise<{ wsId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getSatelliteAppSessionUser('contacts');
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { wsId } = await params;
  const permissions = await getPermissions({ user, wsId });
  if (!permissions) {
    return NextResponse.json(
      { error: 'Workspace access denied' },
      { status: 403 }
    );
  }
  if (!permissions.containsPermission('manage_workspace_settings')) {
    return NextResponse.json(
      { error: 'Insufficient permissions to view workspace settings' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const privateDb = sbAdmin.schema('private');
  const [
    { count: pendingReportsCount, error: reportsCountError },
    { count: pendingPostsCount, error: postsCountError },
  ] = await Promise.all([
    privateDb
      .from('external_user_monthly_reports_workspace_view')
      .select('id', { count: 'exact', head: true })
      .eq('user_ws_id', permissions.wsId)
      .eq('report_approval_status', 'PENDING'),
    privateDb
      .from('user_group_post_checks')
      .select(
        'post_id, user_group_posts!inner(workspace_user_groups!inner(ws_id))',
        { count: 'exact', head: true }
      )
      .eq('user_group_posts.workspace_user_groups.ws_id', permissions.wsId)
      .eq('approval_status', 'PENDING'),
  ]);

  if (reportsCountError || postsCountError) {
    console.error('Failed to load Contacts pending approval counts:', {
      postsCountError,
      reportsCountError,
    });
    return NextResponse.json(
      { error: 'Failed to fetch pending approval counts' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    pending: {
      posts: pendingPostsCount ?? 0,
      reports: pendingReportsCount ?? 0,
    },
  });
}
