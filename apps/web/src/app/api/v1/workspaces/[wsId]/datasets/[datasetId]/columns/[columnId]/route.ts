import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    datasetId: string;
    columnId: string;
  }>;
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { columnId } = await params;

  // Delete all cells using this column first
  const { error: cellsError } = await supabase
    .from('workspace_dataset_cell')
    .delete()
    .eq('column_id', columnId);

  if (cellsError) {
    console.log(cellsError);
    return NextResponse.json(
      { message: 'Error deleting cells' },
      { status: 500 }
    );
  }

  // Then delete the column itself
  const { error: columnError } = await supabase
    .from('workspace_dataset_columns')
    .delete()
    .eq('id', columnId);

  if (columnError) {
    console.log(columnError);
    return NextResponse.json(
      { message: 'Error deleting column' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}