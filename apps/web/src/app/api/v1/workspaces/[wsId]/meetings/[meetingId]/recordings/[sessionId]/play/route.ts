import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
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

    // Get all audio chunks for this session
    const { data: audioChunks, error: chunksError } = await supabase
      .from('audio_chunks')
      .select('*')
      .eq('session_id', sessionId)
      .order('chunk_order', { ascending: true });

    if (chunksError) {
      console.error('Error fetching audio chunks:', chunksError);
      return NextResponse.json(
        { error: 'Failed to fetch audio chunks' },
        { status: 500 }
      );
    }

    if (!audioChunks || audioChunks.length === 0) {
      return NextResponse.json(
        { error: 'No audio chunks found for this recording session' },
        { status: 404 }
      );
    }

    // Generate signed URLs for each chunk
    const chunkUrls = await Promise.all(
      audioChunks.map(async (chunk) => {
        const { data: urlData } = await supabase.storage
          .from('workspaces')
          .createSignedUrl(chunk.storage_path, 3600); // 1 hour expiry

        return {
          chunkId: chunk.id,
          chunkOrder: chunk.chunk_order,
          url: urlData?.signedUrl || null,
          createdAt: chunk.created_at,
        };
      })
    );

    // Filter out chunks without valid URLs
    const validChunks = chunkUrls.filter((chunk) => chunk.url !== null);

    if (validChunks.length === 0) {
      return NextResponse.json(
        { error: 'No valid audio chunks found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId,
      sessionStatus: session.status,
      chunks: validChunks,
      message: 'Audio chunks retrieved successfully',
    });
  } catch (error) {
    console.error('Error in recording playback API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
