import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const { withoutPermission } = await getPermissions({ wsId });

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
    const { data: requests, error } = await supabase
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
      .eq('workspace_id', wsId);

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
