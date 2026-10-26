import { connection, type NextRequest, NextResponse } from 'next/server';
import { createLegacyHeadHandler } from '@/legacy-api-routes/head';
import {
  datasetCellParentsMatch,
  withDatasetAccess,
} from '../../dataset-access';

interface Params {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; datasetId: string }> }
) {
  await connection();
  return withDatasetAccess(request, await params, async (supabase, scope) => {
    try {
      const { datasetId } = scope;
      const searchParams = request.nextUrl.searchParams;
      const page = parseInt(searchParams.get('page') || '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      // Get total count
      const { count } = await supabase
        .from('workspace_dataset_rows')
        .select('*', { count: 'exact', head: true })
        .eq('dataset_id', datasetId);

      // Get rows using the view
      const { data: rows, error } = await supabase
        .from('workspace_dataset_row_cells')
        .select('*')
        .eq('dataset_id', datasetId)
        .order('row_id')
        .range(start, end);

      if (error) throw error;

      return NextResponse.json({
        data: rows || [],
        totalRows: count || 0,
        page,
        pageSize,
      });
    } catch (error) {
      console.error('Error fetching rows:', error);
      return NextResponse.json(
        { error: 'Failed to fetch rows' },
        { status: 500 }
      );
    }
  });
}

export async function POST(req: Request, { params }: Params) {
  return withDatasetAccess(req, await params, async (supabase, scope) => {
    const { datasetId } = scope;
    const { rows } = await req.json();

    const columnsResponse = await supabase
      .from('workspace_dataset_columns')
      .select('id, name')
      .eq('dataset_id', datasetId);

    if (columnsResponse.error) {
      console.log(columnsResponse.error);
      return NextResponse.json(
        { message: 'Error fetching columns' },
        { status: 500 }
      );
    }

    const columns = columnsResponse.data;

    const { data: newRow, error: newRowError } = await supabase
      .from('workspace_dataset_rows')
      .insert({ dataset_id: datasetId })
      .select('id')
      .single();

    if (newRowError) {
      console.log(newRowError);
      return NextResponse.json(
        { message: 'Error creating new row' },
        { status: 500 }
      );
    }

    const insertData = rows.flatMap((row: any) =>
      columns.map((column: any) => ({
        dataset_id: datasetId,
        column_id: column.id,
        row_id: newRow.id,
        data: row[column.name] || null,
      }))
    );

    const { error } = await supabase
      .from('workspace_dataset_cells')
      .insert(insertData);

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error saving data' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  });
}

export async function PUT(req: Request, { params }: Params) {
  return withDatasetAccess(req, await params, async (supabase, scope) => {
    const { wsId, datasetId } = scope;
    const { rowId, row } = await req.json();

    if (
      !(await datasetCellParentsMatch(supabase, { wsId, datasetId, rowId }))
    ) {
      return NextResponse.json(
        { message: 'Dataset row not found' },
        { status: 404 }
      );
    }

    const columnsResponse = await supabase
      .from('workspace_dataset_columns')
      .select('id, name')
      .eq('dataset_id', datasetId);

    if (columnsResponse.error) {
      console.log(columnsResponse.error);
      return NextResponse.json(
        { message: 'Error fetching columns' },
        { status: 500 }
      );
    }

    const columns = columnsResponse.data;

    const updateData = columns.map((column: any) => ({
      dataset_id: datasetId,
      column_id: column.id,
      row_id: rowId,
      data: row[column.name] || null,
    }));

    const { error } = await supabase
      .from('workspace_dataset_cells')
      .upsert(updateData);

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error updating data' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
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
        .from('workspace_dataset_rows')
        .delete()
        .eq('dataset_id', datasetId);

      if (error) throw error;

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error deleting all rows:', error);
      return NextResponse.json(
        { error: 'Failed to delete all rows' },
        { status: 500 }
      );
    }
  });
}

export const HEAD = createLegacyHeadHandler(GET);
