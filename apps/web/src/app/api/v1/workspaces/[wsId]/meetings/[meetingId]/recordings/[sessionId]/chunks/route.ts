import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

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
    const chunkOrder = parseInt(formData.get('chunkOrder') as string);
    const isLastChunk = formData.get('isLastChunk') === 'true';

    if (!audioBlob || isNaN(chunkOrder)) {
      return NextResponse.json(
        { error: 'Invalid audio data or chunk order' },
        { status: 400 }
      );
    }

    // Generate a unique filename for this chunk
    const timestamp = Date.now();
    const chunkId = `${sessionId}-chunk-${chunkOrder}-${timestamp}`;
    const storagePath = `${wsId}/recordings/${meetingId}/${sessionId}/${chunkId}.webm`;

    // Upload the audio chunk to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('workspaces')
      .upload(storagePath, audioBlob, {
        contentType: 'audio/webm',
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

    // If this is the last chunk, update the session status
    if (isLastChunk) {
      const { error: updateError } = await supabase
        .from('recording_sessions')
        .update({
          status: 'pending_transcription',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (updateError) {
        console.error('Error updating session status:', updateError);
        // Don't fail the request, just log the error
      }
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
