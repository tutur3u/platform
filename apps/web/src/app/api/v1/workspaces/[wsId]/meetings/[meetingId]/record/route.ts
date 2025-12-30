import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(
  _request: NextRequest,
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
    const { data: meeting } = await supabase
      .from('workspace_meetings')
      .select('*')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .single();

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Check if there's already an active recording session
    const { data: existingSession } = await supabase
      .from('recording_sessions')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('status', 'recording')
      .single();

    if (existingSession) {
      // Stop the existing recording
      const { error: updateError } = await supabase
        .from('recording_sessions')
        .update({
          status: 'pending_transcription',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSession.id);

      if (updateError) {
        console.error('Error stopping recording session:', updateError);
        return NextResponse.json(
          { error: 'Failed to stop recording' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'stopped',
        sessionId: existingSession.id,
        message: 'Recording stopped successfully',
      });
    } else {
      // Start a new recording session
      const { data: newSession, error: sessionError } = await supabase
        .from('recording_sessions')
        .insert({
          meeting_id: meetingId,
          status: 'recording',
          user_id: user.id,
        })
        .select()
        .single();

      if (sessionError) {
        console.error('Error creating recording session:', sessionError);
        return NextResponse.json(
          { error: 'Failed to start recording' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'started',
        sessionId: newSession.id,
        message: 'Recording started successfully',
      });
    }
  } catch (error) {
    console.error('Error in recording API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
