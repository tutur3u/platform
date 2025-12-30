import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function PUT(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ wsId: string; meetingId: string; sessionId: string }> }
) {
  try {
    const { wsId, meetingId, sessionId } = await params;
    const { status } = await request.json();

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

    // Verify the recording session exists
    const { data: session } = await supabase
      .from('recording_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('meeting_id', meetingId)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: 'Recording session not found' },
        { status: 404 }
      );
    }

    // Update the recording session status
    const { error: updateError } = await supabase
      .from('recording_sessions')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('meeting_id', meetingId);

    if (updateError) {
      console.error('Error updating recording session:', updateError);
      return NextResponse.json(
        { error: 'Failed to update recording session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Recording session ${status}`,
    });
  } catch (error) {
    console.error('Error in recording API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ wsId: string; meetingId: string; sessionId: string }> }
) {
  try {
    const { wsId, meetingId, sessionId } = await params;
    const { transcript, status } = await request.json();

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

    // Verify the recording session exists
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

    // First, save the transcript if provided
    if (transcript) {
      if (!transcript.text || typeof transcript.text !== 'string') {
        return NextResponse.json(
          { error: 'Invalid transcript: text is required' },
          { status: 400 }
        );
      }

      if (
        typeof transcript.durationInSeconds !== 'number' ||
        transcript.durationInSeconds < 0
      ) {
        return NextResponse.json(
          {
            error:
              'Invalid transcript: durationInSeconds must be a positive number',
          },
          { status: 400 }
        );
      }

      const { error: transcriptError } = await supabase
        .from('recording_transcripts')
        .upsert({
          session_id: sessionId,
          text: transcript.text,
          segments: transcript.segments,
          language: transcript.language,
          duration_in_seconds: transcript.durationInSeconds,
        });

      if (transcriptError) {
        console.error('Error saving transcript:', transcriptError);
        return NextResponse.json(
          { error: 'Failed to save transcript' },
          { status: 500 }
        );
      }
    }

    // Update the recording session status if provided
    if (status) {
      // Verify the recording session exists
      const { data: session } = await supabase
        .from('recording_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('meeting_id', meetingId)
        .single();

      if (!session) {
        return NextResponse.json(
          { error: 'Recording session not found' },
          { status: 404 }
        );
      }

      const { error: updateError } = await supabase
        .from('recording_sessions')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('meeting_id', meetingId);

      if (updateError) {
        console.error('Error updating recording session:', updateError);
        return NextResponse.json(
          { error: 'Failed to update recording session' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Recording session updated successfully',
    });
  } catch (error) {
    console.error('Error in recording session patch API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
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

    // Delete the recording session (audio chunks and transcripts will be deleted automatically due to CASCADE)
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
