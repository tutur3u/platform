import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
  _: Request,
  { params }: { params: { wsId: string; datasetId: string } }
) {
  try {
    const { datasetId } = params;
    const supabase = await createClient();

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
}
