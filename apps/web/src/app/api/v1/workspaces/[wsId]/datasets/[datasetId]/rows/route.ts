import { createClient } from '@/utils/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

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
  try {
    const { datasetId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    const supabase = await createClient();

    // Get total count first
    const { count } = await supabase
      .from('workspace_dataset_rows')
      .select('*', { count: 'exact', head: true })
      .eq('dataset_id', datasetId);

    // Then get paginated rows with their cells
    const { data: rows, error } = await supabase
      .from('workspace_dataset_rows')
      .select(
        `
        id,
        workspace_dataset_cell (
          data,
          workspace_dataset_columns (
            name
          )
        )
      `
      )
      .eq('dataset_id', datasetId)
      .order('created_at', { ascending: true })
      .range(start, end);

    if (error) throw error;

    // Transform the data to a more usable format
    const transformedRows = rows?.map((row) => {
      const rowData: Record<string, any> = {};
      row.workspace_dataset_cell?.forEach((cell: any) => {
        rowData[cell.workspace_dataset_columns.name] = cell.data;
      });
      return { id: row.id, ...rowData };
    });

    return NextResponse.json({
      data: transformedRows || [],
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
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { datasetId } = await params;
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
    .from('workspace_dataset_cell')
    .insert(insertData);

  if (error) {
    console.log(error);
    return NextResponse.json({ message: 'Error saving data' }, { status: 500 });
  }

  return NextResponse.json({ message: 'success' });
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { datasetId } = await params;
  const { rowId, row } = await req.json();

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
    .from('workspace_dataset_cell')
    .upsert(updateData);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating data' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { rowId } = await req.json();

  const { error: deleteCellsError } = await supabase
    .from('workspace_dataset_cell')
    .delete()
    .eq('row_id', rowId);

  if (deleteCellsError) {
    console.log(deleteCellsError);
    return NextResponse.json(
      { message: 'Error deleting cells' },
      { status: 500 }
    );
  }

  const { error: deleteRowError } = await supabase
    .from('workspace_dataset_rows')
    .delete()
    .eq('id', rowId);

  if (deleteRowError) {
    console.log(deleteRowError);
    return NextResponse.json(
      { message: 'Error deleting row' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
