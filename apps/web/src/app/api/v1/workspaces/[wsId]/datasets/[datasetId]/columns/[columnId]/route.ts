import { NextResponse } from 'next/server';
import { withDatasetAccess } from '../../../dataset-access';

interface Params {
  params: Promise<{
    wsId: string;
    datasetId: string;
    columnId: string;
  }>;
}

export async function DELETE(_: Request, { params }: Params) {
  return withDatasetAccess(_, await params, async (supabase, scope) => {
    const { columnId } = await params;
    const { datasetId } = scope;
    const { data: column, error } = await supabase
      .from('workspace_dataset_columns')
      .select('id')
      .eq('id', columnId)
      .eq('dataset_id', datasetId)
      .maybeSingle();
    if (error)
      return NextResponse.json(
        { message: 'Error verifying column' },
        { status: 500 }
      );
    if (!column)
      return NextResponse.json(
        { message: 'Column not found' },
        { status: 404 }
      );

    // Delete all cells using this column first
    const { error: cellsError } = await supabase
      .from('workspace_dataset_cells')
      .delete()
      .eq('column_id', columnId)
      .eq('dataset_id', datasetId);

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
      .eq('id', columnId)
      .eq('dataset_id', datasetId);

    if (columnError) {
      console.log(columnError);
      return NextResponse.json(
        { message: 'Error deleting column' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  });
}

export async function PUT(request: Request, { params }: Params) {
  return withDatasetAccess(request, await params, async (supabase, scope) => {
    const { columnId } = await params;
    const { datasetId } = scope;
    const { data: column, error } = await supabase
      .from('workspace_dataset_columns')
      .select('id')
      .eq('id', columnId)
      .eq('dataset_id', datasetId)
      .maybeSingle();
    if (error)
      return NextResponse.json(
        { message: 'Error verifying column' },
        { status: 500 }
      );
    if (!column)
      return NextResponse.json(
        { message: 'Column not found' },
        { status: 404 }
      );
    const { name } = await request.json();

    const { error: updateError } = await supabase
      .from('workspace_dataset_columns')
      .update({ name })
      .eq('id', columnId)
      .eq('dataset_id', datasetId);

    if (updateError) {
      console.log(updateError);
      return NextResponse.json(
        { message: 'Error updating column' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  });
}
