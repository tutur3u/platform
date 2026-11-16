import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveCoMemberNames } from '@tuturuuu/utils/co-member-names';
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
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: true,
    });
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const supabase = auth.supabase;
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
    const requesters = new Map<string, TimeTrackingRequestUserRow['user']>();
    for (const row of requestRows) {
      if (row.user && row.user_id && !requesters.has(row.user_id)) {
        requesters.set(row.user_id, row.user);
      }
    }
    const requesterIds = [...requesters.keys()];

    // Public handles back up nameless requesters. The view's private email is
    // never forwarded; co-member emails only appear as the resolved name.
    const { data: profiles, error: profilesError } = requesterIds.length
      ? await sbAdmin
          .from('users')
          .select('id, display_name, handle')
          .in('id', requesterIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;

    const profilesById = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile])
    );
    const names = await resolveCoMemberNames({
      admin: sbAdmin,
      wsId: normalizedWsId,
      viewerUserId: user.id,
      users: requesterIds.map((id) => {
        const profile = profilesById.get(id);
        return {
          id,
          display_name:
            requesters.get(id)?.display_name ?? profile?.display_name,
          handle: profile?.handle,
        };
      }),
      options: { fallback: 'Unknown' },
    });

    // Extract unique users
    const uniqueUsers = requesterIds.map((id) => ({
      id,
      display_name: names.get(id) || 'Unknown',
    }));

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
