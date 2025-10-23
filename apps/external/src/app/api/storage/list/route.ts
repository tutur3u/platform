import { type NextRequest, NextResponse } from 'next/server';
import { tuturuuu } from 'tuturuuu';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const path = searchParams.get('path') || '';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const files = await tuturuuu.storage.list({
      path: path || undefined,
      limit,
    });

    return NextResponse.json(files);
  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to list files',
      },
      { status: 500 }
    );
  }
}
