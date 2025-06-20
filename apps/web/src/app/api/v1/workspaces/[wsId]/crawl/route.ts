import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { wsId } = await params;

  const body = (await req.json()) as {
    id?: string | null;
    url?: string | null;
  };
  const { id, url: rawUrl } = body;

  if (!rawUrl) {
    return NextResponse.json(
      { message: 'Missing required parameter: url' },
      { status: 400 }
    );
  }

  if (wsId !== ROOT_WORKSPACE_ID) {
    return NextResponse.json(
      { message: 'Crawling is only allowed for the root workspace' },
      { status: 403 }
    );
  }

  // if not ends with /, add it
  const url = rawUrl.endsWith('/') ? rawUrl.trim() : `${rawUrl.trim()}/`;
  const apiKey = (await headers()).get('API_KEY');

  return apiKey
    ? getDataWithApiKey(req, { id, url, wsId, apiKey })
    : getDataFromSession(req, { id, url, wsId });
}

async function getDataWithApiKey(
  _: NextRequest,
  {
    id,
    url,
    wsId,
    apiKey,
  }: {
    id?: string | null;
    url: string;
    wsId: string;
    apiKey: string;
  }
) {
  const sbAdmin = await createAdminClient();

  const apiCheckQuery = sbAdmin
    .from('workspace_api_keys')
    .select('id')
    .eq('ws_id', wsId)
    .eq('value', apiKey)
    .single();

  const secretCheckQuery = sbAdmin
    .from('workspace_secrets')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId);

  const crawledUrlQuery = sbAdmin
    .from('crawled_urls')
    .select('*', { count: 'exact' })
    .eq('url', url)
    .maybeSingle();

  const [apiCheck, secretCheck, crawledUrlCheck] = await Promise.all([
    apiCheckQuery,
    secretCheckQuery,
    crawledUrlQuery,
  ]);

  const { error: workspaceError } = apiCheck;
  const { count: secretCount, error: secretError } = secretCheck;
  const {
    data: crawledUrlData,
    error: crawledUrlError,
    count: crawledCount,
  } = crawledUrlCheck;

  if (secretCount === 0 && wsId !== ROOT_WORKSPACE_ID) {
    return NextResponse.json(
      { message: 'Crawling is disabled for this workspace' },
      { status: 403 }
    );
  }

  if (
    crawledCount !== 0 &&
    (crawledUrlData?.html || crawledUrlData?.markdown)
  ) {
    console.log('URL already crawled', crawledUrlData);
    return NextResponse.json(
      { message: 'URL already crawled' },
      { status: 400 }
    );
  }

  if (workspaceError || secretError || crawledUrlError) {
    console.log(workspaceError || secretError || crawledUrlError);
    return NextResponse.json(
      { message: 'Error fetching workspace crawlers' },
      { status: 500 }
    );
  }

  // make POST request to SCRAPER_URL with ?url=${url}
  const res = await fetch(
    `${process.env.SCRAPER_URL}?url=${encodeURIComponent(url.replace(/\/$/, ''))}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { message: 'Failed to crawl', status: res.status },
      { status: res.status }
    );
  }

  const data = await res.json();

  const { data: crawledUrl, error: crawledError } = await sbAdmin
    .from('crawled_urls')
    .upsert({
      id: id ?? undefined,
      url,
      html: data.html,
      markdown: data.markdown,
      creator_id: 'UNKNOWN',
    })
    .eq('url', url)
    .select('id')
    .single();

  if (crawledError) {
    console.error('Error inserting crawled URL:', crawledError);
    return NextResponse.json(
      { message: 'Error inserting crawled URL' },
      { status: 500 }
    );
  }

  const { error: nextUrlsError } = await sbAdmin
    .from('crawled_url_next_urls')
    .insert([
      ...data.kept.map((nextUrl: string) => ({
        origin_id: crawledUrl.id,
        url: nextUrl,
        skipped: false,
      })),
      ...data.skipped.map((nextUrl: string) => ({
        origin_id: crawledUrl.id,
        url: nextUrl,
        skipped: true,
      })),
    ]);

  if (nextUrlsError) {
    console.error('Error inserting next URLs:', nextUrlsError);
    return NextResponse.json(
      { message: 'Error inserting next URLs' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

async function getDataFromSession(
  _: NextRequest,
  {
    id,
    url,
    wsId,
  }: {
    id?: string | null;
    url: string;
    wsId: string;
  }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email?.endsWith('@tuturuuu.com')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();

  const workspaceCheckQuery = supabase
    .from('workspaces')
    .select('*')
    .eq('id', wsId);

  const secretCheckQuery = sbAdmin
    .from('workspace_secrets')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .eq('name', 'ALLOW_CRAWLERS')
    .eq('value', 'true')
    .maybeSingle();

  const crawledUrlQuery = sbAdmin
    .from('crawled_urls')
    .select('*', { count: 'exact' })
    .eq('url', url)
    .maybeSingle();

  const [workspaceCheck, secretCheck, crawledUrlCheck] = await Promise.all([
    workspaceCheckQuery,
    secretCheckQuery,
    crawledUrlQuery,
  ]);

  const { error: workspaceError } = workspaceCheck;
  const { count: secretCount, error: secretError } = secretCheck;
  const {
    data: crawledUrlData,
    error: crawledUrlError,
    count: crawledCount,
  } = crawledUrlCheck;

  if (secretCount === 0 && wsId !== ROOT_WORKSPACE_ID) {
    return NextResponse.json(
      { message: 'Crawling is disabled for this workspace' },
      { status: 403 }
    );
  }

  if (
    crawledCount !== 0 &&
    (crawledUrlData?.html || crawledUrlData?.markdown)
  ) {
    console.log('URL already crawled', crawledUrlData);
    return NextResponse.json(
      { message: 'URL already crawled' },
      { status: 400 }
    );
  }

  if (workspaceError || secretError || crawledUrlError) {
    console.log(workspaceError || secretError || crawledUrlError);
    return NextResponse.json(
      { message: 'Error fetching workspace crawlers' },
      { status: 500 }
    );
  }

  // make POST request to SCRAPER_URL with ?url=${url}
  const res = await fetch(
    `${process.env.SCRAPER_URL}?url=${encodeURIComponent(url.replace(/\/$/, ''))}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { message: 'Failed to crawl', status: res.status },
      { status: res.status }
    );
  }

  const data = await res.json();

  const { data: crawledUrl, error: crawledError } = await sbAdmin
    .from('crawled_urls')
    .upsert({
      id: id ?? undefined,
      url,
      html: data.html,
      markdown: data.markdown,
      creator_id: user.id,
    })
    .eq('url', url)
    .select('id')
    .single();

  if (crawledError) {
    console.error('Error inserting crawled URL:', crawledError);
    return NextResponse.json(
      { message: 'Error inserting crawled URL' },
      { status: 500 }
    );
  }

  const { error: nextUrlsError } = await sbAdmin
    .from('crawled_url_next_urls')
    .insert([
      ...data.kept.map((nextUrl: string) => ({
        origin_id: crawledUrl.id,
        url: nextUrl,
        skipped: false,
      })),
      ...data.skipped.map((nextUrl: string) => ({
        origin_id: crawledUrl.id,
        url: nextUrl,
        skipped: true,
      })),
    ]);

  if (nextUrlsError) {
    console.error('Error inserting next URLs:', nextUrlsError);
    return NextResponse.json(
      { message: 'Error inserting next URLs' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
