import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const permissions = await getPermissions({ wsId, request });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (permissions.withoutPermission('manage_workspace_settings')) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view workspace settings' },
        { status: 403 }
      );
    }

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const [
      { count: pendingReportsCount, error: reportsCountError },
      { count: pendingPostsCount, error: postsCountError },
    ] = await Promise.all([
      sbAdmin
        .from('external_user_monthly_reports')
        .select('id, user:workspace_users!user_id!inner(ws_id)', {
          count: 'exact',
          head: true,
        })
        .eq('user.ws_id', wsId)
        .eq('report_approval_status', 'PENDING'),
      sbAdmin
        .from('user_group_post_checks')
        .select(
          'post_id, user_group_posts!inner(workspace_user_groups!inner(ws_id))',
          {
            count: 'exact',
            head: true,
          }
        )
        .eq('user_group_posts.workspace_user_groups.ws_id', wsId)
        .eq('approval_status', 'PENDING'),
    ]);

    if (reportsCountError || postsCountError) {
      console.error('Error getting pending approval counts:', {
        reportsCountError,
        postsCountError,
      });
      return NextResponse.json(
        { error: 'Failed to fetch pending approval counts' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      pending: {
        reports: pendingReportsCount ?? 0,
        posts: pendingPostsCount ?? 0,
      },
    });
  } catch (error) {
    console.error('Error in pending approvals summary API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
