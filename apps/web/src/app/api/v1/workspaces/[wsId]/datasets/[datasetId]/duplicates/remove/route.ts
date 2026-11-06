import { NextResponse } from 'next/server';
import { removeDuplicates } from '@/app/[locale]/(dashboard)/[wsId]/(ai)/datasets/[datasetId]/utils';
import { withDatasetAccess } from '../../../dataset-access';

export async function POST(
  _: Request,
  { params }: { params: Promise<{ wsId: string; datasetId: string }> }
) {
  return withDatasetAccess(_, await params, async (supabase, scope) => {
    try {
      const { wsId, datasetId } = scope;

      // Verify dataset exists and belongs to workspace
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
      const { removedCount } = await removeDuplicates(scope);

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
  });
}
