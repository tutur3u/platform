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

    // Check for active recording session
    const { data: activeSession, error: sessionError } = await supabase
      .from('recording_sessions')
      .select('*')
      .eq('meeting_id', meetingId)
      .in('status', ['recording', 'pending_transcription', 'transcribing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (sessionError && sessionError.code !== 'PGRST116') {
      console.error('Error fetching active session:', sessionError);
      return NextResponse.json(
        { error: 'Failed to fetch active session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      session: activeSession || null,
    });
  } catch (error) {
    console.error('Error in active session API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
