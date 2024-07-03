import { createAdminClient, createClient } from '@/utils/supabase/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: {
    wsId: string;
  };
}

export async function GET(req: NextRequest, { params: { wsId } }: Params) {
  const apiKey = headers().get('API_KEY');
  return apiKey
    ? getDataWithApiKey(req, { wsId, apiKey })
    : getDataFromSession(req, { wsId });
}

async function getDataWithApiKey(
  req: NextRequest,
  {
    wsId,
    apiKey,
  }: {
    wsId: string;
    apiKey: string;
  }
) {
  const sbAdmin = createAdminClient();

  const apiCheckQuery = sbAdmin
    .from('workspace_api_keys')
    .select('id')
    .eq('ws_id', wsId)
    .eq('value', apiKey)
    .single();

  const mainQuery = sbAdmin
    .from('workspace_users')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .order('full_name', { ascending: true })
    .order('display_name', { ascending: true });

  const searchParams = req.nextUrl.searchParams;
  const query = searchParams.get('q');

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = searchParams.get('limit');

  console.log({ query, from, to, limit });

  if (query) mainQuery.textSearch('full_name', query);
  if (from && to) mainQuery.range(parseInt(from), parseInt(to));
  if (limit) mainQuery.limit(parseInt(limit));

  const [apiCheck, response] = await Promise.all([apiCheckQuery, mainQuery]);

  const { error: apiError } = apiCheck;

  if (apiError) {
    console.log(apiError);
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  const { data, count, error } = response;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data, count });
}

async function getDataFromSession(
  req: NextRequest,
  { wsId }: { wsId: string }
) {
  const supabase = createClient();

  const mainQuery = supabase
    .from('workspace_users')
    .select('*')
    .eq('ws_id', wsId);

  const searchParams = new URLSearchParams(req.nextUrl.search);
  const query = searchParams.get('query');

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = searchParams.get('limit');

  if (query) mainQuery.textSearch('full_name', query);
  if (from && to) mainQuery.range(parseInt(from), parseInt(to));
  if (limit) mainQuery.limit(parseInt(limit));

  const { data, error } = await mainQuery;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}
