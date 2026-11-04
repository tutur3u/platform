import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { canManageLegacyRecording } from '../../../_lib/recording-access';

const MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ wsId: string; meetingId: string; sessionId: string }> }
) {
  try {
    const { wsId: rawWsId, meetingId, sessionId } = await params;
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

    const { data: meeting, error: meetingError } = await supabase
      .from('workspace_meetings')
      .select('id')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (meetingError)
      return NextResponse.json(
        { error: 'Failed to verify meeting access' },
        { status: 500 }
      );
    if (!meeting)
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

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

    if (
      !(await canManageLegacyRecording({
        supabase,
        wsId,
        userId: user.id,
        creatorId: session.user_id,
      }))
    ) {
      return NextResponse.json(
        {
          error:
            'Only the recording creator or a workspace admin can upload audio to this recording',
        },
        { status: 403 }
      );
    }

    // Get the form data
    const formData = await request.formData();
    const audioBlob = formData.get('audio');
    const rawChunkOrder = formData.get('chunkOrder');
    const chunkOrder =
      typeof rawChunkOrder === 'string' && rawChunkOrder.trim()
        ? Number(rawChunkOrder)
        : Number.NaN;

    if (
      !(audioBlob instanceof Blob) ||
      !Number.isSafeInteger(chunkOrder) ||
      chunkOrder < 0
    ) {
      return NextResponse.json(
        { error: 'Invalid audio data or chunk order' },
        { status: 400 }
      );
    }

    // Validate audio blob
    if (audioBlob.size === 0) {
      return NextResponse.json(
        { error: 'Audio blob is empty' },
        { status: 400 }
      );
    }

    if (audioBlob.size > MAX_CHUNK_SIZE) {
      return NextResponse.json(
        { error: 'Audio chunk exceeds maximum size limit' },
        { status: 400 }
      );
    }

    // Validate content type
    const allowedTypes = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg'];
    const contentType = audioBlob.type || 'audio/webm';

    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: 'Invalid audio format' },
        { status: 400 }
      );
    }

    console.log(
      `Processing chunk ${chunkOrder}: ${audioBlob.size} bytes, type: ${audioBlob.type}`
    );

    // Generate a unique filename for this chunk
    const timestamp = Date.now();
    const chunkId = `${sessionId}-chunk-${chunkOrder}-${timestamp}`;
    // Recordings are private storage: write with the service role after the
    // membership and session checks above.
    const sbAdmin = await createAdminClient();
    const storagePath = `${wsId}/recordings/${meetingId}/${sessionId}/${chunkId}.webm`;

    // Upload the audio chunk to storage
    const { error: uploadError } = await sbAdmin.storage
      .from('workspaces')
      .upload(storagePath, audioBlob, {
        contentType: contentType,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Error uploading audio chunk:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload audio chunk' },
        { status: 500 }
      );
    }

    // Save the chunk metadata to the database
    const { data: chunkData, error: chunkError } = await supabase
      .from('audio_chunks')
      .insert({
        session_id: sessionId,
        chunk_order: chunkOrder,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (chunkError || !chunkData) {
      console.error('Error saving audio chunk metadata:', chunkError);
      // Try to clean up the uploaded file
      await sbAdmin.storage.from('workspaces').remove([storagePath]);
      return NextResponse.json(
        {
          error:
            chunkError?.code === '42501' ||
            chunkError?.code === 'PGRST116' ||
            !chunkError
              ? 'You no longer have permission to upload audio to this recording'
              : 'Failed to save audio chunk metadata',
        },
        {
          status:
            chunkError?.code === '42501' ||
            chunkError?.code === 'PGRST116' ||
            !chunkError
              ? 403
              : 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      chunkId: chunkData.id,
      storagePath,
      message: 'Audio chunk uploaded successfully',
    });
  } catch (error) {
    console.error('Error in audio chunk upload API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
