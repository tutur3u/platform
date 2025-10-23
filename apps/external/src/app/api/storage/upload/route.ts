import { type NextRequest, NextResponse } from 'next/server';
import { tuturuuu } from 'tuturuuu';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string;
    const upsert = formData.get('upsert') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // The SDK now uses signed upload URLs internally
    // This uploads directly to Supabase Storage without proxying through the API
    const result = await tuturuuu.storage.upload(file, {
      path: path || undefined,
      upsert,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to upload file',
      },
      { status: 500 }
    );
  }
}
