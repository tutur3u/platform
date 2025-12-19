import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
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

    const body = await request.json();
    const {
      session_id,
      break_type_id,
      break_type_name,
      break_start,
      break_end,
    } = body;

    if (!session_id || !break_start) {
      return NextResponse.json(
        { error: 'session_id and break_start are required' },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Verify the session belongs to the user in this workspace
    const { data: session } = await sbAdmin
      .from('time_tracking_sessions')
      .select('id')
      .eq('id', session_id)
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    // Create the break record
    const { data: breakRecord, error: breakError } = await sbAdmin
      .from('time_tracking_breaks')
      .insert({
        session_id,
        break_type_id: break_type_id || null,
        break_type_name: break_type_name || 'Break',
        break_start,
        break_end: break_end || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (breakError) {
      console.error('Failed to create break:', breakError);
      return NextResponse.json(
        { error: 'Failed to create break' },
        { status: 500 }
      );
    }

    return NextResponse.json({ break: breakRecord });
  } catch (error) {
    console.error('Error in break creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
