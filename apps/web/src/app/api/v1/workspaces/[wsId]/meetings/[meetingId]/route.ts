import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; meetingId: string }> }
) {
  try {
    const { wsId, meetingId } = await params;
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

    // Verify the meeting exists and belongs to this workspace
    const { data: existingMeeting } = await supabase
      .from('workspace_meetings')
      .select('*')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .single();

    if (!existingMeeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, time } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Update the meeting
    const { data: meeting, error } = await supabase
      .from('workspace_meetings')
      .update({
        name,
        time: time || new Date().toISOString(),
      })
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .select(
        `
        *,
        creator:users!workspace_meetings_creator_id_fkey(
          display_name
        )
      `
      )
      .single();

    if (error) {
      console.error('Error updating meeting:', error);
      return NextResponse.json(
        { error: 'Failed to update meeting' },
        { status: 500 }
      );
    }

    return NextResponse.json({ meeting });
  } catch (error) {
    console.error('Error in meetings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; meetingId: string }> }
) {
  try {
    const { wsId, meetingId } = await params;
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

    // Verify the meeting exists and belongs to this workspace
    const { data: existingMeeting } = await supabase
      .from('workspace_meetings')
      .select('*')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .single();

    if (!existingMeeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Delete the meeting
    const { error } = await supabase
      .from('workspace_meetings')
      .delete()
      .eq('id', meetingId)
      .eq('ws_id', wsId);

    if (error) {
      console.error('Error deleting meeting:', error);
      return NextResponse.json(
        { error: 'Failed to delete meeting' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in meetings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
