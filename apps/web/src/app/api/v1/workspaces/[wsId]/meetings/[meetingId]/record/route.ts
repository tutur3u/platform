import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { legacyRecorderRetiredResponse } from '../_lib/legacy-recorder-lock';
import { canManageLegacyRecording } from '../_lib/recording-access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; meetingId: string }> }
) {
  try {
    const { wsId: rawWsId, meetingId } = await params;
    const supabase = await createClient();

    // Aliases like 'personal' are not UUIDs, so the membership lookup errors
    // out and reports membership_lookup_failed instead of a real answer.
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
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
    const { data: existingSession, error: sessionLookupError } = await supabase
      .from('recording_sessions')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('status', 'recording')
      .single();

    if (sessionLookupError && sessionLookupError.code !== 'PGRST116') {
      return NextResponse.json(
        { error: 'Failed to verify the active recording' },
        { status: 500 }
      );
    }

    if (existingSession) {
      if (
        !(await canManageLegacyRecording({
          supabase,
          wsId,
          userId: user.id,
          creatorId: existingSession.user_id,
        }))
      ) {
        return NextResponse.json(
          {
            error:
              'Only the recording creator or a workspace admin can stop this recording',
          },
          { status: 403 }
        );
      }
      // Stop the existing recording
      const { data: stopped, error: updateError } = await supabase
        .from('recording_sessions')
        .update({
          status: 'pending_transcription',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSession.id)
        .eq('meeting_id', meetingId)
        .select('id');

      if (updateError?.code === '42501' || (!updateError && !stopped?.length)) {
        return NextResponse.json(
          { error: 'You no longer have permission to stop this recording' },
          { status: 403 }
        );
      }
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
    }

    // The legacy recorder is retired: an already-active session can still be
    // stopped above, but a new one is never started.
    return legacyRecorderRetiredResponse(request);
  } catch (error) {
    console.error('Error in recording API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
