import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

async function validateApiKey(wsId: string, apiKey: string) {
  const sbAdmin = await createAdminClient();
  const { error } = await sbAdmin
    .from('workspace_api_keys')
    .select('id')
    .eq('ws_id', wsId)
    .eq('value', apiKey)
    .single();

  return !error;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { wsId, datasetId } = await params;
  const apiKey = (await headers()).get('API_KEY');

  if (apiKey) {
    const isValid = await validateApiKey(wsId, apiKey);
    if (!isValid) {
      return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
    }
  }

  const supabase = apiKey ? await createAdminClient() : await createClient();
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
