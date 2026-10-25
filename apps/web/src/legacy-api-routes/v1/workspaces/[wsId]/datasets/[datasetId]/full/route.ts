import { type NextRequest, NextResponse } from 'next/server';
import { resolveDatasetAccess } from '../dataset-access';

interface Params {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { wsId, datasetId } = await params;

  // The row-cells view has no ws_id column, so the dataset id is only queried
  // after resolveDatasetAccess proves it belongs to wsId.
  const access = await resolveDatasetAccess({ wsId, datasetId });
  if (!access.ok) return access.response;

  const { supabase } = access;
  const searchParams = req.nextUrl.searchParams;

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = searchParams.get('limit');

  const query = supabase
    .from('workspace_dataset_row_cells')
    .select('row_id, cells')
    .eq('dataset_id', datasetId);

  if (from && to) query.range(parseInt(from, 10), parseInt(to, 10));
  if (limit) query.limit(parseInt(limit, 10));

  const { data, error } = await query;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching dataset rows' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
