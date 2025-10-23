import { type NextRequest, NextResponse } from 'next/server';
import { tuturuuu } from 'tuturuuu';

interface BatchShareRequest {
  paths: string[];
  expiresIn?: number;
}

/**
 * POST /api/storage/share-batch
 *
 * Generates signed URLs for multiple files in a single request
 * Uses the Tuturuuu SDK's batch method for efficient processing
 */
export async function POST(request: NextRequest) {
  try {
    const { paths, expiresIn = 3600 } =
      (await request.json()) as BatchShareRequest;

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json(
        { error: 'Paths array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (paths.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 paths can be processed at once' },
        { status: 400 }
      );
    }

    // Use SDK's batch method directly
    const result = await tuturuuu.storage.createSignedUrls(paths, expiresIn);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating batch signed URLs:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate batch signed URLs',
      },
      { status: 500 }
    );
  }
}
