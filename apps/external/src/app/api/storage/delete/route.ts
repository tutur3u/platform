import { type NextRequest, NextResponse } from 'next/server';
import { tuturuuu } from 'tuturuuu';

export async function DELETE(request: NextRequest) {
  try {
    const { paths } = await request.json();

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json(
        { error: 'Paths array is required' },
        { status: 400 }
      );
    }

    const result = await tuturuuu.storage.delete(paths);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error deleting files:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to delete files',
      },
      { status: 500 }
    );
  }
}
