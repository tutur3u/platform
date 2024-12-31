import { createClient } from '@/utils/supabase/server';
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

    if (!rows?.length) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    const supabase = await createClient();

    // First get all columns for this dataset
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

    // Delete existing rows and their cells
    const { error: deleteError } = await supabase
      .from('workspace_dataset_rows')
      .delete()
      .eq('dataset_id', datasetId);

    if (deleteError) throw deleteError;

    // Insert rows in batches
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);

      // Insert rows first
      const { data: newRows, error: rowError } = await supabase
        .from('workspace_dataset_rows')
        .insert(batch.map(() => ({ dataset_id: datasetId })))
        .select('id');

      if (rowError) throw rowError;
      if (!newRows) continue;

      // Then create cells for each row
      const cellsToCreate = newRows.flatMap((row) =>
        Object.entries(batch[newRows.indexOf(row)] || {})
          .filter(([colName]) => columnMap.has(colName))
          .map(([colName, value]) => ({
            dataset_id: datasetId,
            row_id: row.id,
            column_id: columnMap.get(colName)!,
            data: value?.toString() ?? null,
          }))
      );

      // Insert cells in sub-batches
      for (let j = 0; j < cellsToCreate.length; j += 100) {
        const cellBatch = cellsToCreate.slice(j, j + 100);
        const { error: cellError } = await supabase
          .from('workspace_dataset_cell')
          .insert(cellBatch);

        if (cellError) throw cellError;
      }
    }

    return NextResponse.json({ success: true });
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
