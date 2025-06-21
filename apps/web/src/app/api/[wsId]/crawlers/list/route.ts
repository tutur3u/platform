import { createAdminClient, createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const domain = searchParams.get('domain');
    const search = searchParams.get('search');

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email?.endsWith('@tuturuuu.com')) {
      throw new Error('Unauthorized');
    }

    const sbAdmin = await createAdminClient();

    // Build main query
    const queryBuilder = sbAdmin
      .from('crawled_urls')
      .select('*', {
        count: 'exact',
      })
      .order('created_at', { ascending: false });

    // Apply filters
    if (domain && domain !== 'all') {
      // Use hostname check for more accurate domain filtering
      try {
        const domainHost = new URL(`http://${domain}`).hostname;
        queryBuilder.filter('url', 'ilike', `%${domainHost}%`);
      } catch {
        // Fallback to simple string matching if domain is invalid
        queryBuilder.ilike('url', `%${domain}%`);
      }
    }

    if (search) {
      queryBuilder.or(
        `url.ilike.%${search}%,markdown.ilike.%${search}%,html.ilike.%${search}%`
      );
    }

    // Apply pagination
    if (page && pageSize) {
      const start = (page - 1) * pageSize;
      const end = page * pageSize - 1;
      queryBuilder.range(start, end);
    }

    const { data, error, count } = await queryBuilder;

    if (error) throw error;

    return NextResponse.json({
      data,
      count: count ?? 0,
    });
  } catch (error) {
    console.error('Failed to fetch crawled URLs:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
