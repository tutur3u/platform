import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const RowsSchema = z.object({
  rows: z.array(z.record(z.string(), z.any())),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; datasetId: string }> }
) {
  try {
    const { datasetId } = await params;
    const json = await request.json();
    const { rows } = RowsSchema.parse(json);

    console.log('Received rows count:', rows.length); // Debug log

    if (!rows?.length) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get all columns first
    const { data: columns } = await supabase
      .from('workspace_dataset_columns')
      .select('id, name')
      .eq('dataset_id', datasetId);

    if (!columns?.length) {
      return NextResponse.json(
        { error: 'No columns found for dataset' },
        { status: 400 }
      );
    }

    // Create column name to ID mapping
    const columnMap = new Map(columns.map((col) => [col.name, col.id]));

    // Insert all rows at once
    const { data: newRows, error: rowError } = await supabase
      .from('workspace_dataset_rows')
      .insert(rows.map(() => ({ dataset_id: datasetId })))
      .select('id');

    if (rowError) throw rowError;
    if (!newRows)
      return NextResponse.json({ error: 'No rows created' }, { status: 500 });

    console.log('Created rows count:', newRows.length); // Debug log

    // Create cells for each row
    const cellsToCreate = newRows.flatMap((row, rowIndex) =>
      Object.entries(rows[rowIndex] ?? {})
        .filter(([colName]) => columnMap.has(colName))
        .map(([colName, value]) => ({
          dataset_id: datasetId,
          row_id: row.id,
          column_id: columnMap.get(colName)!,
          data: value?.toString() ?? null,
        }))
    );

    console.log('Cells to create:', cellsToCreate.length); // Debug log

    // Insert cells in batches
    const cellBatchSize = 1000;
    for (let i = 0; i < cellsToCreate.length; i += cellBatchSize) {
      const batch = cellsToCreate.slice(i, i + cellBatchSize);
      const { error: cellError } = await supabase
        .from('workspace_dataset_cells')
        .insert(batch);

      if (cellError) throw cellError;
    }

    return NextResponse.json({
      success: true,
      rowsProcessed: rows.length,
      cellsCreated: cellsToCreate.length,
    });
  } catch (error) {
    console.error('Error syncing rows:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Failed to sync rows' }, { status: 500 });
  }
}
