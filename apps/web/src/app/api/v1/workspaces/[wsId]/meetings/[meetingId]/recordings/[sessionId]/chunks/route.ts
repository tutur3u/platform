import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

const MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(
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

    // Get the form data
    const formData = await request.formData();
    const audioBlob = formData.get('audio') as Blob;
    const chunkOrder = parseInt(formData.get('chunkOrder') as string, 10);

    if (!audioBlob || Number.isNaN(chunkOrder)) {
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
    const storagePath = `${wsId}/recordings/${meetingId}/${sessionId}/${chunkId}.webm`;

    // Upload the audio chunk to storage
    const { error: uploadError } = await supabase.storage
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

    if (chunkError) {
      console.error('Error saving audio chunk metadata:', chunkError);
      // Try to clean up the uploaded file
      await supabase.storage.from('workspaces').remove([storagePath]);
      return NextResponse.json(
        { error: 'Failed to save audio chunk metadata' },
        { status: 500 }
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
