import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';

interface WorkspaceParams {
  wsId: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<WorkspaceParams> }
) {
  try {
    const { wsId } = await params;

    if (!validate(wsId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(req);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: boards, error: boardsError } = await supabase
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
      boards: boards.map((board) => ({
        ...board,
        name: board.name?.trim() ? board.name : 'Untitled Board',
      })),
    });
  } catch (error) {
    console.error('Unexpected error fetching estimation boards:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
