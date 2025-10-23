import { type NextRequest, NextResponse } from 'next/server';
import { tuturuuu } from 'tuturuuu';

export async function POST(request: NextRequest) {
  try {
    const { path, expiresIn } = await request.json();

    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    const result = await tuturuuu.storage.share(path, {
      expiresIn: expiresIn || 3600, // Default 1 hour
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate signed URL',
      },
      { status: 500 }
    );
  }
}
