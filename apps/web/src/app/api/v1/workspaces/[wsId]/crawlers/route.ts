import { ROOT_WORKSPACE_ID } from '@/constants/common';
import {
  createAdminClient,
  createClient,
} from '@ncthub/supabase/next/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { wsId } = await params;

  const apiKey = (await headers()).get('API_KEY');
  return apiKey
    ? getDataWithApiKey(req, { wsId, apiKey })
    : getDataFromSession();
}

async function getDataWithApiKey(
  _: NextRequest,
  {
    wsId,
    apiKey,
  }: {
    wsId: string;
    apiKey: string;
  }
) {
  if (wsId !== ROOT_WORKSPACE_ID) {
    return NextResponse.json(
      { message: 'Invalid workspace ID' },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();

  const apiCheckQuery = sbAdmin
    .from('workspace_api_keys')
    .select('id')
    .eq('ws_id', wsId)
    .eq('value', apiKey)
    .single();

  const mainQuery = sbAdmin
    .from('crawled_urls')
    .select('*', { count: 'exact' });

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
      { message: 'Error fetching workspace crawlers' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data, count });
}

async function getDataFromSession() {
  const supabase = await createClient();

  const { data, error } = await supabase.from('crawled_urls').select('*');

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace crawlers' },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email?.endsWith('@tuturuuu.com')) {
    throw new Error('Unauthorized');
  }

  const sbAdmin = await createAdminClient();

  const data = await req.json();
  const rawUrl = data.url as string | null;

  if (!rawUrl) {
    return NextResponse.json(
      { message: 'Missing required parameter: url' },
      { status: 400 }
    );
  }

  const url = rawUrl.endsWith('/') ? rawUrl.trim() : `${rawUrl.trim()}/`;

  const { data: existingUrl } = await sbAdmin
    .from('crawled_urls')
    .select('*')
    .eq('url', url)
    .maybeSingle();

  if (existingUrl) {
    return NextResponse.json(
      { message: 'URL already exists' },
      { status: 400 }
    );
  }

  const { error } = await sbAdmin.from('crawled_urls').insert({
    url,
    creator_id: user.id,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace crawler' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
