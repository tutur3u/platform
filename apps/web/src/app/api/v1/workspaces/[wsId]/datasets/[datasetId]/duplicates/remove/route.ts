import { removeDuplicates } from '@/app/[locale]/(dashboard)/[wsId]/(ai)/datasets/[datasetId]/utils';
import { createClient } from '@repo/supabase/next/server';
import { NextResponse } from 'next/server';

export async function POST(
  _: Request,
  { params }: { params: Promise<{ wsId: string; datasetId: string }> }
) {
  try {
    const { wsId, datasetId } = await params;

    // Verify dataset exists and belongs to workspace
    const supabase = await createClient();
    const { data: dataset } = await supabase
      .from('workspace_datasets')
      .select('*')
      .eq('id', datasetId)
      .eq('ws_id', wsId)
      .single();

    if (!dataset) {
      return new NextResponse('Dataset not found', { status: 404 });
    }

    // Remove duplicates
    const { removedCount } = await removeDuplicates(datasetId);

    return NextResponse.json({
      removedCount,
      message: `Removed ${removedCount} duplicate rows`,
    });
  } catch (error) {
    console.error('Error removing duplicates:', error);
    return new NextResponse(
      error instanceof Error ? error.message : 'Internal server error',
      { status: 500 }
    );
  }
}
