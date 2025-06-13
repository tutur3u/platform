import { createClient } from '@ncthub/supabase/next/server';
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
    .from('workspace_dataset_cells')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('created_at', { ascending: true });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching cells' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { datasetId } = await params;
  const { rowId, columnId, data } = await req.json();

  const { data: cell, error } = await supabase
    .from('workspace_dataset_cells')
    .insert({
      dataset_id: datasetId,
      row_id: rowId,
      column_id: columnId,
      data,
    })
    .select()
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating cell' },
      { status: 500 }
    );
  }

  return NextResponse.json(cell);
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { datasetId } = await params;
  const { rowId, columnId, data } = await req.json();

  const { error } = await supabase
    .from('workspace_dataset_cells')
    .update({ data })
    .eq('dataset_id', datasetId)
    .eq('row_id', rowId)
    .eq('column_id', columnId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating cell' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { datasetId } = await params;
  const { rowId, columnId } = await req.json();

  const { error } = await supabase
    .from('workspace_dataset_cells')
    .delete()
    .eq('dataset_id', datasetId)
    .eq('row_id', rowId)
    .eq('column_id', columnId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting cell' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
