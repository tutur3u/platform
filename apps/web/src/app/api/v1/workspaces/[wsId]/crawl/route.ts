import { createAdminClient, createClient } from '@tutur3u/supabase/next/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { wsId } = await params;

  const body = (await req.json()) as { url?: string | null };
  const { url } = body;

  if (!url) {
    return NextResponse.json(
      { message: 'Missing required parameter: url' },
      { status: 400 }
    );
  }

  const apiKey = (await headers()).get('API_KEY');
  return apiKey
    ? getDataWithApiKey(req, { url, wsId, apiKey })
    : getDataFromSession(req, { url, wsId });
}

async function getDataWithApiKey(
  _: NextRequest,
  {
    url,
    wsId,
    apiKey,
  }: {
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
  const { count: crawledCount, error: crawledUrlError } = crawledUrlCheck;

  if (secretCount === 0) {
    return NextResponse.json(
      { message: 'Crawling is disabled for this workspace' },
      { status: 403 }
    );
  }

  if (crawledCount !== 0) {
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
    `${process.env.SCRAPER_URL}?url=${encodeURIComponent(url)}`,
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
    .insert({
      url,
      html: data.html,
      markdown: data.markdown,
    })
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
  { url, wsId }: { url: string; wsId: string }
) {
  const supabase = await createClient();
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
  const { count: crawledCount, error: crawledUrlError } = crawledUrlCheck;

  if (secretCount === 0) {
    return NextResponse.json(
      { message: 'Crawling is disabled for this workspace' },
      { status: 403 }
    );
  }

  if (crawledCount !== 0) {
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
    `${process.env.SCRAPER_URL}?url=${encodeURIComponent(url)}`,
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
    .insert({
      url,
      html: data.html,
      markdown: data.markdown,
    })
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
