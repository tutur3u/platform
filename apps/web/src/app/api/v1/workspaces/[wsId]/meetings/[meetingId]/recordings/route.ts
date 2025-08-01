import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
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
    const { data: meeting } = await supabase
      .from('workspace_meetings')
      .select('id')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .single();

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Fetch recording sessions for this meeting
    const { data: sessions, error: sessionsError } = await supabase
      .from('recording_sessions')
      .select(
        `
        id,
        status,
        created_at,
        updated_at,
        recording_transcriptions(
          text,
          created_at
        )
      `
      )
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false });

    if (sessionsError) {
      console.error('Error fetching recording sessions:', sessionsError);
      return NextResponse.json(
        { error: 'Failed to fetch recording sessions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sessions: sessions || [],
      totalSessions: sessions?.length || 0,
    });
  } catch (error) {
    console.error('Error in recording sessions API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
