import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

type TimeTrackingRequestUserRow = {
  user_id: string | null;
  user: {
    display_name?: string | null;
    id?: string | null;
  } | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    let supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: true,
    });
    if (!auth.ok) return auth.response;
    const { user } = auth;
    supabase = auth.supabase;

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
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
      .schema('private')
      .from('time_tracking_requests_with_details')
      .select('user_id, user')
      .eq('workspace_id', normalizedWsId);

    if (error) throw error;

    const requestRows = (requests ?? []) as TimeTrackingRequestUserRow[];

    // Extract unique users
    const uniqueUsers = Array.from(
      new Map(
        requestRows
          ?.filter((r) => r.user)
          .map((r) => [
            r.user_id,
            {
              id: r.user_id,
              display_name: r.user?.display_name || 'Unknown',
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
