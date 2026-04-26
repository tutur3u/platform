import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PUBLIC_MODEL_COLUMNS = [
  'cache_read_price_per_token',
  'cache_write_price_per_token',
  'context_window',
  'description',
  'id',
  'image_gen_price',
  'input_price_per_token',
  'input_tiers',
  'is_enabled',
  'max_tokens',
  'name',
  'output_price_per_token',
  'output_tiers',
  'pricing_raw',
  'provider',
  'released_at',
  'search_price',
  'synced_at',
  'tags',
  'type',
  'web_search_price',
].join(', ');

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function sanitizeIlikeTerm(value: string) {
  return value.trim().replaceAll(/[,%()]/g, '');
}

export async function GET(request: NextRequest) {
  const sbAdmin = await createAdminClient();
  const searchParams = request.nextUrl.searchParams;
  const pageParam = searchParams.get('page');
  const limitParam = searchParams.get('limit');
  const page = parsePositiveInt(pageParam, 1);
  const limit = Math.min(100, parsePositiveInt(limitParam, 100));
  const provider = searchParams.get('provider');
  const enabled = searchParams.get('enabled');
  const type = searchParams.get('type') ?? 'language';
  const search = sanitizeIlikeTerm(
    searchParams.get('search') ?? searchParams.get('q') ?? ''
  );
  const tag = searchParams.get('tag');
  const shouldPaginate =
    searchParams.get('format') === 'paginated' ||
    pageParam !== null ||
    limitParam !== null;

  let query = sbAdmin
    .from('ai_gateway_models')
    .select(
      PUBLIC_MODEL_COLUMNS,
      shouldPaginate ? { count: 'exact' } : undefined
    );

  if (type !== 'all') {
    query = query.eq('type', type);
  }

  if (provider) {
    query = query.eq('provider', provider);
  }

  if (tag) {
    query = query.contains('tags', [tag]);
  }

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `id.ilike.${pattern},name.ilike.${pattern},provider.ilike.${pattern},description.ilike.${pattern}`
    );
  }

  if (enabled === 'true') {
    query = query.eq('is_enabled', true);
  } else if (enabled === 'false') {
    query = query.eq('is_enabled', false);
  }

  query = query.order('provider').order('name');

  if (shouldPaginate) {
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching AI Models' },
      { status: 500 }
    );
  }

  if (shouldPaginate) {
    return NextResponse.json({
      data,
      pagination: { page, limit, total: count ?? 0 },
    });
  }

  return NextResponse.json(data);
}
