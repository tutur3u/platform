import { connection, NextResponse } from 'next/server';
import { createLegacyHeadHandler } from '@/legacy-api-routes/head';
import { withDatasetAccess } from '../../dataset-access';
import { columnNameBodySchema, parseJsonBody } from '../../dataset-body';

interface Params {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  await connection();
  return withDatasetAccess(_, await params, async (supabase, scope) => {
    const { datasetId } = scope;

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
  });
}

export async function POST(req: Request, { params }: Params) {
  return withDatasetAccess(req, await params, async (supabase, scope) => {
    const { datasetId } = scope;
    const body = await parseJsonBody(req, columnNameBodySchema);
    if (!body.ok) return body.response;
    const { name } = body.data;

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
  });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ wsId: string; datasetId: string }> }
) {
  return withDatasetAccess(_, await params, async (supabase, scope) => {
    try {
      const { datasetId } = scope;

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
  });
}

export const HEAD = createLegacyHeadHandler(GET);
