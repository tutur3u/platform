import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { datasetId } = await params;
  const url = new URL(req.url);

  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  const { data: columns, error: columnsError } = await supabase
    .from('workspace_dataset_columns')
    .select('id, name')
    .eq('dataset_id', datasetId);

  if (columnsError) {
    console.log(columnsError);
    return NextResponse.json(
      { message: 'Error fetching columns' },
      { status: 500 }
    );
  }

  const { data: rows, error: rowsError } = await supabase
    .from('workspace_dataset_rows')
    .select('id')
    .eq('dataset_id', datasetId)
    .range(start, end);

  if (rowsError) {
    console.log(rowsError);
    return NextResponse.json(
      { message: 'Error fetching rows' },
      { status: 500 }
    );
  }

  const rowIds = rows.map((row: any) => row.id);

  const { data: cells, error: cellsError } = await supabase
    .from('workspace_dataset_cell')
    .select('row_id, column_id, data')
    .in('row_id', rowIds);

  if (cellsError) {
    console.log(cellsError);
    return NextResponse.json(
      { message: 'Error fetching cells' },
      { status: 500 }
    );
  }

  const rowData = rows.map((row: any) => {
    const rowCells = cells.filter((cell: any) => cell.row_id === row.id);
    const rowObject: any = { id: row.id };
    rowCells.forEach((cell: any) => {
      const column = columns.find((col: any) => col.id === cell.column_id);
      if (column) {
        rowObject[column.name] = cell.data;
      }
    });
    return rowObject;
  });

  const totalRows = rows.length;

  return NextResponse.json({
    data: rowData,
    totalRows,
    page,
    pageSize,
  });
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
