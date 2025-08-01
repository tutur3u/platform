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

    if (!audioBlob) {
      return NextResponse.json(
        { error: 'Invalid audio data' },
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

    console.log(
      `Processing complete recording: ${audioBlob.size} bytes, type: ${audioBlob.type}`
    );

    // Upload the complete recording to storage
    const timestamp = Date.now();
    const recordingId = `${sessionId}-complete-${timestamp}`;
    const storagePath = `${wsId}/recordings/${meetingId}/${sessionId}/${recordingId}.webm`;

    const { error: uploadError } = await supabase.storage
      .from('workspaces')
      .upload(storagePath, audioBlob, {
        contentType: audioBlob.type || 'audio/webm',
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Error uploading complete recording:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload recording' },
        { status: 500 }
      );
    }

    // For now, we'll create a single chunk entry for the complete recording
    // In the future, we could implement server-side chunking here
    const { data: chunkData, error: chunkError } = await supabase
      .from('audio_chunks')
      .insert({
        session_id: sessionId,
        chunk_order: 0,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (chunkError) {
      console.error('Error saving recording metadata:', chunkError);
      // Try to clean up the uploaded file
      await supabase.storage.from('workspaces').remove([storagePath]);
      return NextResponse.json(
        { error: 'Failed to save recording metadata' },
        { status: 500 }
      );
    }

    // Update the session status
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

    return NextResponse.json({
      success: true,
      recordingId: chunkData.id,
      storagePath,
      message: 'Recording uploaded successfully',
    });
  } catch (error) {
    console.error('Error in recording upload API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
