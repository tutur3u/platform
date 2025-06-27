import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';

interface WorkspaceParams {
  wsId: string;
}

// UUID validation regex (accepts UUID v4 format or the special root workspace nil UUID)
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<WorkspaceParams> }
) {
  try {
    const { wsId } = await params;

    // Validate workspace ID format
    if (!wsId || wsId === 'undefined') {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400 }
      );
    }

    // Validate UUID format (allow root workspace or valid UUID)
    if (!UUID_REGEX.test(wsId) && wsId !== ROOT_WORKSPACE_ID) {
      return NextResponse.json(
        { error: 'Invalid workspace ID format' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view boards' },
        { status: 401 }
      );
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'You don\'t have access to this workspace' },
        { status: 403 }
      );
    }

    // Fetch boards with their lists
    const { data, error } = await supabase
      .from('workspace_boards')
      .select(
        `
        id,
        name,
        created_at,
        task_lists (
          id,
          name,
          status,
          color,
          position
        )
      `
      )
      .eq('ws_id', wsId)
      .eq('deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch boards' },
        { status: 500 }
      );
    }

    return NextResponse.json({ boards: data });
  } catch (error) {
    console.error('Error fetching boards with lists:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
