import { NextRequest, NextResponse } from 'next/server';
import { TuturuuuClient } from 'tuturuuu';

const tuturuuu = new TuturuuuClient({
  apiKey: process.env.TUTURUUU_API_KEY || '',
  baseUrl: process.env.TUTURUUU_BASE_URL || '',
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;

    if (!path || path.length === 0) {
      return NextResponse.json({ error: 'Missing file path' }, { status: 400 });
    }

    const filePath = path.join('/');
    const blob = await tuturuuu.storage.download(filePath);

    // Return the blob with appropriate content type
    return new NextResponse(blob, {
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to download file',
      },
      { status: 500 }
    );
  }
}
