import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ColumnsSchema = z.object({
  columns: z.array(
    z
      .object({
        name: z.string().min(1),
      })
      .optional()
  ),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; datasetId: string }> }
) {
  try {
    const { datasetId } = await params;
    const json = await request.json();
    const { columns } = ColumnsSchema.parse(json);

    const filteredColumns = columns.filter((col) => col?.name);

    if (!filteredColumns?.length) {
      return NextResponse.json(
        { error: 'No columns provided' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // First get existing columns
    const { data: existingColumns } = await supabase
      .from('workspace_dataset_columns')
      .select('*')
      .eq('dataset_id', datasetId);

    // Delete columns that are no longer present
    const existingNames = existingColumns?.map((col) => col.name) || [];
    const newNames = filteredColumns.map((col) => col?.name);

    const columnsToDelete = existingColumns?.filter(
      (col) => !newNames.includes(col.name)
    );

    if (columnsToDelete?.length) {
      await supabase
        .from('workspace_dataset_columns')
        .delete()
        .in(
          'id',
          columnsToDelete.map((col) => col.id)
        );
    }

    // Add new columns
    const columnsToAdd = filteredColumns.filter(
      (col) => !existingNames.includes(col?.name as string)
    );

    if (columnsToAdd.length) {
      await supabase.from('workspace_dataset_columns').insert(
        columnsToAdd.map((col) => ({
          dataset_id: datasetId,
          name: col?.name as string,
        }))
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error syncing columns:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to sync columns' },
      { status: 500 }
    );
  }
}
