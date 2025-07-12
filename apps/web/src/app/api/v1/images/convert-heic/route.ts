import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the incoming request
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Check if file is HEIC/HEIF
    const isHeicFile = /\.(heic|heif)$/i.test(file.name);
    if (!isHeicFile) {
      return NextResponse.json(
        { error: 'File is not a HEIC/HEIF file' },
        { status: 400 }
      );
    }

    // Check file size (limit to 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 50MB' },
        { status: 400 }
      );
    }

    // Convert HEIC to JPEG
    const heicConvert = (await import('heic-convert')).default;
    const arrayBuffer = await file.arrayBuffer();

    // Create timeout to prevent hanging
    const conversionPromise = heicConvert({
      buffer: new Uint8Array(arrayBuffer),
      format: 'JPEG',
      quality: 0.9,
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Conversion timed out after 30 seconds')),
        30000
      );
    });

    // Race between conversion and timeout
    const outputBuffer = (await Promise.race([
      conversionPromise,
      timeoutPromise,
    ])) as ArrayBuffer;

    // Create response with converted file
    const convertedFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');

    return new NextResponse(outputBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="${convertedFileName}"`,
        'X-Converted-Filename': convertedFileName,
      },
    });
  } catch (error) {
    console.error('HEIC conversion failed:', error);

    // Provide specific error types for proper handling
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return NextResponse.json(
          { error: 'HEIC_CONVERSION_TIMEOUT' },
          { status: 408 }
        );
      } else if (
        error.message.includes('memory') ||
        error.message.includes('heap')
      ) {
        return NextResponse.json(
          { error: 'HEIC_CONVERSION_MEMORY' },
          { status: 507 }
        );
      } else if (
        error.message.includes('codec') ||
        error.message.includes('unsupported')
      ) {
        return NextResponse.json(
          { error: 'HEIC_CONVERSION_UNSUPPORTED' },
          { status: 415 }
        );
      }
    }

    return NextResponse.json(
      { error: 'HEIC_CONVERSION_FAILED' },
      { status: 500 }
    );
  }
}
