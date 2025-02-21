import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    datasetId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { datasetId } = await params;

  const { data, error } = await supabase
    .from('workspace_dataset_columns')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('created_at', { ascending: true });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching columns' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { datasetId } = await params;
  const { name } = await req.json();

  // Create the column first
  const { data: column, error: columnError } = await supabase
    .from('workspace_dataset_columns')
    .insert({
      dataset_id: datasetId,
      name: name.trim(),
    })
    .select()
    .single();

  if (columnError) {
    console.log(columnError);
    return NextResponse.json(
      { message: 'Error creating column' },
      { status: 500 }
    );
  }

  // Now create empty cells for all existing rows
  const { data: rows } = await supabase
    .from('workspace_dataset_rows')
    .select('id')
    .eq('dataset_id', datasetId);

  if (rows && rows.length > 0) {
    const cellsToCreate = rows.map((row) => ({
      dataset_id: datasetId,
      column_id: column.id,
      row_id: row.id,
      data: null,
    }));

    const { error: cellsError } = await supabase
      .from('workspace_dataset_cells')
      .insert(cellsToCreate);

    if (cellsError) {
      console.log(cellsError);
      // Don't return error here as the column was already created
    }
  }

  return NextResponse.json(column);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ wsId: string; datasetId: string }> }
) {
  try {
    const { datasetId } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('workspace_dataset_columns')
      .delete()
      .eq('dataset_id', datasetId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting all columns:', error);
    return NextResponse.json(
      { error: 'Failed to delete all columns' },
      { status: 500 }
    );
  }
}
