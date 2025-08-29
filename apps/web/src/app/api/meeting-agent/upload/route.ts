import { createClient } from '@ncthub/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

const UPLOAD_SIZE_LIMIT_MB = 50;
const UPLOAD_SIZE_LIMIT_BYTES = UPLOAD_SIZE_LIMIT_MB * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    if (audioBlob.size > UPLOAD_SIZE_LIMIT_BYTES) {
      return NextResponse.json(
        {
          error: `Audio blob is too large. Max size is ${UPLOAD_SIZE_LIMIT_MB}MB`,
        },
        { status: 400 }
      );
    }

    console.log(
      `Processing complete recording: ${audioBlob.size} bytes, type: ${audioBlob.type}`
    );

    // Upload the complete recording to storage
    const timestamp = Date.now();
    const recordingId = `recordings-${timestamp}`;
    const storagePath = `meeting-agent/${recordingId}.webm`;

    const { error: uploadError } = await supabase.storage
      .from('recordings')
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

    const { data: insertData, error: insertError } = await supabase
      .from('media_uploads')
      .insert({
        user_id: user.id,
        storage_path: storagePath,
        status: 'uploaded',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error saving recording metadata:', insertError);
      // Try to clean up the uploaded file
      await supabase.storage.from('recordings').remove([storagePath]);
      return NextResponse.json(
        { error: 'Failed to save recording metadata' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        recordingId: insertData.id,
        storagePath,
        message: 'Recording uploaded successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in recording upload API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
