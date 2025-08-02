import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ wsId: string; meetingId: string; sessionId: string }> }
) {
  try {
    const { wsId, meetingId, sessionId } = await params;
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

    // Verify the recording session exists and belongs to this meeting
    const { data: session } = await supabase
      .from('recording_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('meeting_id', meetingId)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: 'Recording session not found' },
        { status: 404 }
      );
    }

    // Delete the recording session (audio chunks and transcriptions will be deleted automatically due to CASCADE)
    const { error } = await supabase
      .from('recording_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('meeting_id', meetingId);

    if (error) {
      console.error('Error deleting recording session:', error);
      return NextResponse.json(
        { error: 'Failed to delete recording session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in recording session delete API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
