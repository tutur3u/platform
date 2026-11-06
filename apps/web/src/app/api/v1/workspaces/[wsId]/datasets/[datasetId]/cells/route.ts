import { connection, NextResponse } from 'next/server';
import { createLegacyHeadHandler } from '@/legacy-api-routes/head';
import {
  datasetCellParentsMatch,
  withDatasetAccess,
} from '../../dataset-access';
import {
  cellDeleteBodySchema,
  cellWriteBodySchema,
  parseJsonBody,
} from '../../dataset-body';

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
  });
}

export async function POST(req: Request, { params }: Params) {
  return withDatasetAccess(req, await params, async (supabase, scope) => {
    const { wsId, datasetId } = scope;
    const body = await parseJsonBody(req, cellWriteBodySchema);
    if (!body.ok) return body.response;
    const { rowId, columnId, data } = body.data;

    if (
      !(await datasetCellParentsMatch(supabase, {
        wsId,
        datasetId,
        rowId,
        columnId,
      }))
    ) {
      return NextResponse.json(
        { message: 'Dataset row or column not found' },
        { status: 404 }
      );
    }

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
  });
}

export async function PUT(req: Request, { params }: Params) {
  return withDatasetAccess(req, await params, async (supabase, scope) => {
    const { wsId, datasetId } = scope;
    const body = await parseJsonBody(req, cellWriteBodySchema);
    if (!body.ok) return body.response;
    const { rowId, columnId, data } = body.data;
    if (
      !(await datasetCellParentsMatch(supabase, {
        wsId,
        datasetId,
        rowId,
        columnId,
      }))
    ) {
      return NextResponse.json(
        { message: 'Dataset row or column not found' },
        { status: 404 }
      );
    }

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
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withDatasetAccess(req, await params, async (supabase, scope) => {
    const { wsId, datasetId } = scope;
    const body = await parseJsonBody(req, cellDeleteBodySchema);
    if (!body.ok) return body.response;
    const { rowId, columnId } = body.data;
    if (
      !(await datasetCellParentsMatch(supabase, {
        wsId,
        datasetId,
        rowId,
        columnId,
      }))
    ) {
      return NextResponse.json(
        { message: 'Dataset row or column not found' },
        { status: 404 }
      );
    }

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
  });
}

export const HEAD = createLegacyHeadHandler(GET);
