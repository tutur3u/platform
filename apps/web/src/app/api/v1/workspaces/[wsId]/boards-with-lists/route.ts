import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  _: NextRequest,
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

    if (error) throw error;

    return NextResponse.json({ boards: data });
  } catch (error) {
    console.error('Error fetching boards with lists:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
