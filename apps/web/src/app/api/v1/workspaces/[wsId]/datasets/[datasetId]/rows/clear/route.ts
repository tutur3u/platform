import { NextResponse } from 'next/server';
import { withDatasetAccess } from '../../../dataset-access';

export async function POST(
  _: Request,
  { params }: { params: Promise<{ wsId: string; datasetId: string }> }
) {
  return withDatasetAccess(_, await params, async (supabase, scope) => {
    try {
      const { datasetId } = scope;

      const { error: deleteRowsError } = await supabase
        .from('workspace_dataset_rows')
        .delete()
        .eq('dataset_id', datasetId);

      if (deleteRowsError) {
        throw deleteRowsError;
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error clearing all rows:', error);
      return NextResponse.json(
        { error: 'Failed to clear all rows' },
        { status: 500 }
      );
    }
  });
}
