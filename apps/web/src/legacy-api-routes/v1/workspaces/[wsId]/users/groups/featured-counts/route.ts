import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

function normalizeListParam(value: string | string[]) {
  const rawValues = Array.isArray(value) ? value : [value];

  return rawValues
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const SearchParamsSchema = z.object({
  excludedGroups: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => normalizeListParam(val))
    .default([]),
  featuredGroupIds: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => normalizeListParam(val))
    .default([]),
  linkStatus: z.string().default('all'),
  q: z.string().optional(),
  searchQuery: z.string().optional(),
  status: z.string().default('active'),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

function collectSearchParams(searchParams: URLSearchParams) {
  const paramsObj: Record<string, string | string[]> = {};

  searchParams.forEach((value, key) => {
    const existing = paramsObj[key];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        paramsObj[key] = [existing, value];
      }
    } else {
      paramsObj[key] = value;
    }
  });

  return paramsObj;
}

async function readJsonObject(request: Request) {
  const body = await request.json().catch(() => ({}));
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function isSupabaseGatewayHtmlError(error: {
  code?: string | null;
  message?: string | null;
}) {
  const message = error.message ?? '';

  return (
    message.includes('<!DOCTYPE html>') &&
    /Error code 502|502: Bad gateway|Bad gateway/i.test(message)
  );
}

async function handleFeaturedGroupCountsRequest(
  req: Request,
  { params }: Params,
  paramsObj: Record<string, unknown>
) {
  const { wsId } = await params;
  const spResult = SearchParamsSchema.safeParse(paramsObj);

  if (!spResult.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', issues: spResult.error.issues },
      { status: 400 }
    );
  }

  const sp = spResult.data;
  const searchQuery = sp.searchQuery || sp.q || undefined;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (sp.featuredGroupIds.length === 0) {
    return NextResponse.json({});
  }

  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin.rpc('get_featured_group_counts', {
    _ws_id: wsId,
    _featured_group_ids: sp.featuredGroupIds,
    _excluded_groups: sp.excludedGroups,
    _search_query: searchQuery,
    _status: sp.status,
    _link_status: sp.linkStatus,
  });

  if (error) {
    if (isSupabaseGatewayHtmlError(error)) {
      console.warn('Featured group counts temporarily unavailable', {
        featuredGroupCount: sp.featuredGroupIds.length,
        wsId,
      });

      return NextResponse.json(
        Object.fromEntries(sp.featuredGroupIds.map((groupId) => [groupId, 0]))
      );
    }

    console.error(
      'Error fetching featured group counts',
      {
        excludedGroupCount: sp.excludedGroups.length,
        featuredGroupCount: sp.featuredGroupIds.length,
        wsId,
      },
      error
    );
    return NextResponse.json(
      { message: 'Error fetching featured group counts' },
      { status: 500 }
    );
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.group_id] = Number(row.user_count);
  }

  return NextResponse.json(counts);
}

export async function GET(req: Request, context: Params) {
  const { searchParams } = new URL(req.url);

  return withRequestLogDrain(
    {
      request: req,
      route: '/api/v1/workspaces/[wsId]/users/groups/featured-counts',
    },
    () =>
      handleFeaturedGroupCountsRequest(
        req,
        context,
        collectSearchParams(searchParams)
      )
  );
}

export async function POST(req: Request, context: Params) {
  return withRequestLogDrain(
    {
      request: req,
      route: '/api/v1/workspaces/[wsId]/users/groups/featured-counts',
    },
    async () =>
      handleFeaturedGroupCountsRequest(req, context, await readJsonObject(req))
  );
}
