import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    // Verify workspace access
    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const permissions = await getPermissions({
      wsId: normalizedWsId,
      request,
    });
    if (!permissions) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const { withoutPermission } = permissions;

    if (withoutPermission('manage_time_tracking_requests')) {
      return NextResponse.json(
        {
          error:
            'You do not have permission to view time tracking request users.',
        },
        { status: 403 }
      );
    }

    // Get unique users who have submitted time tracking requests
    const { data: requests, error } = await sbAdmin
      .from('time_tracking_requests')
      .select(
        `
        user_id,
        user:users!time_tracking_requests_user_id_fkey(
          id,
          display_name
        )
      `
      )
      .eq('workspace_id', normalizedWsId);

    if (error) throw error;

    // Extract unique users
    const uniqueUsers = Array.from(
      new Map(
        requests
          ?.filter((r) => r.user)
          .map((r) => [
            r.user_id,
            {
              id: r.user_id,
              display_name: r.user.display_name || 'Unknown',
            },
          ]) || []
      ).values()
    );

    return NextResponse.json(uniqueUsers);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
