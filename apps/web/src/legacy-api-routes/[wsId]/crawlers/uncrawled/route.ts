import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface CrawledUrlNextUrl {
  created_at: string;
  origin_id: string;
  skipped: boolean;
  url: string;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const domain = searchParams.get('domain');
    const search = searchParams.get('search');

    const sbAdmin = await createAdminClient();

    // First get total count with a separate query
    let countQuery = sbAdmin
      .from('crawled_url_next_urls')
      .select('url', { count: 'exact' })
      .eq('skipped', false);

    if (domain && domain !== 'all') {
      countQuery = countQuery.ilike('url', `%${domain}%`);
    }

    if (search) {
      countQuery = countQuery.ilike('url', `%${search}%`);
    }

    const { count: totalItems, error: countError } = await countQuery;
    if (countError) throw countError;

    // Get paginated URLs
    let query = sbAdmin
      .from('crawled_url_next_urls')
      .select('*, ...crawled_urls!inner(origin_url:url)')
      .eq('skipped', false);

    if (domain && domain !== 'all') {
      query = query.ilike('url', `%${domain}%`);
    }

    if (search) {
      query = query.ilike('url', `%${search}%`);
    }

    // Apply pagination at database level
    const start = (page - 1) * pageSize;
    query = query.range(start, start + pageSize - 1);

    const { data: nextUrls, error: nextUrlsError } = await query;
    if (nextUrlsError) throw nextUrlsError;

    // Get existing crawled URLs - optimize by only checking against paginated results
    const urlsToCheck = nextUrls?.map((url) => url.url) || [];
    if (urlsToCheck.length === 0) {
      return NextResponse.json({
        uncrawledUrls: [],
        groupedUrls: {},
        pagination: {
          page,
          pageSize,
          totalPages: Math.ceil((totalItems || 0) / pageSize),
          totalItems: totalItems || 0,
        },
      });
    }

    const { data: existingUrls, error: existingUrlsError } = await sbAdmin
      .from('crawled_urls')
      .select('url')
      .in('url', urlsToCheck);

    if (existingUrlsError) throw existingUrlsError;

    // Create a set of existing URLs for faster lookup
    const existingUrlSet = new Set(
      existingUrls.map((url) =>
        url.url.trim().endsWith('/') ? url.url.trim() : `${url.url.trim()}/`
      )
    );

    // Filter out URLs that have already been crawled
    const uncrawledUrls = ((nextUrls as CrawledUrlNextUrl[]) || []).filter(
      (nextUrl) => {
        const normalizedUrl = nextUrl.url.trim().endsWith('/')
          ? nextUrl.url.trim()
          : `${nextUrl.url.trim()}/`;
        return !existingUrlSet.has(normalizedUrl);
      }
    );

    // Group the paginated and filtered URLs
    const groupedUrls = uncrawledUrls.reduce<
      Record<string, CrawledUrlNextUrl[]>
    >((acc, url) => {
      const urls = acc[url.origin_id] || [];
      acc[url.origin_id] = [...urls, url];
      return acc;
    }, {});

    return NextResponse.json({
      uncrawledUrls,
      groupedUrls,
      pagination: {
        page,
        pageSize,
        totalPages: Math.ceil((totalItems || 0) / pageSize),
        totalItems: totalItems || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching uncrawled URLs:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
