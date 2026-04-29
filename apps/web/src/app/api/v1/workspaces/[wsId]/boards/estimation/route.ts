import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

interface WorkspaceParams {
  wsId: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<WorkspaceParams> }
) {
  try {
    const { wsId: rawWsId } = await params;
    const supabase = await createClient(req);

    let wsId: string;
    try {
      wsId = await normalizeWorkspaceId(rawWsId, supabase);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('user not authenticated')
      ) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      throw error;
    }

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceMember = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (workspaceMember.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!workspaceMember.ok) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    const { data: boards, error: boardsError } = await sbAdmin
      .from('workspace_boards')
      .select(
        'id, name, estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues, created_at'
      )
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (boardsError) {
      console.error('Error fetching estimation boards:', boardsError);
      return NextResponse.json(
        { error: 'Failed to fetch boards' },
        { status: 500 }
      );
    }

    if (!boards?.length) {
      return NextResponse.json({ boards: [] });
    }

    return NextResponse.json({
      boards,
    });
  } catch (error) {
    console.error('Unexpected error fetching estimation boards:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
