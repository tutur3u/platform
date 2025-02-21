import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { message: 'Missing required parameter: url' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const crawledUrlQuery = supabase
    .from('crawled_urls')
    .select('*')
    .eq('url', url)
    .maybeSingle();

  const { data: crawledUrl, error: crawledUrlError } = await crawledUrlQuery;

  if (crawledUrlError) {
    return NextResponse.json(
      { message: 'Error fetching crawled URL' },
      { status: 500 }
    );
  }

  if (!crawledUrl) {
    return NextResponse.json({ crawledUrl: null, relatedUrls: [] });
  }

  const { data: relatedUrls, error: relatedUrlsError } = await supabase
    .from('crawled_url_next_urls')
    .select('*')
    .eq('origin_id', crawledUrl.id)
    .order('created_at', { ascending: false });

  if (relatedUrlsError) {
    return NextResponse.json(
      { message: 'Error fetching related URLs' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    crawledUrl,
    relatedUrls: relatedUrls || [],
  });
}
