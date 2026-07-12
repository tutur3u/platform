import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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
    .transform((value) => normalizeListParam(value))
    .default([]),
  featuredGroupIds: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => normalizeListParam(value))
    .default([]),
  linkStatus: z.string().default('all'),
  q: z.string().optional(),
  searchQuery: z.string().optional(),
  status: z.string().default('active'),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

function collectSearchParams(searchParams: URLSearchParams) {
  const params: Record<string, string | string[]> = {};
  searchParams.forEach((value, key) => {
    const existing = params[key];
    if (!existing) params[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else params[key] = [existing, value];
  });
  return params;
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
  return (
    error.message?.includes('<!DOCTYPE html>') === true &&
    /Error code 502|502: Bad gateway|Bad gateway/i.test(error.message)
  );
}

async function handleRequest(
  request: Request,
  { params }: Params,
  rawParams: Record<string, unknown>
) {
  const { wsId: rawWsId } = await params;
  const parsed = SearchParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const permissions = await getUserGroupRoutePermissions(rawWsId, request);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('view_users_public_info')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const sp = parsed.data;
  if (sp.featuredGroupIds.length === 0) return NextResponse.json({});

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin.rpc('get_featured_group_counts', {
    _ws_id: wsId,
    _featured_group_ids: sp.featuredGroupIds,
    _excluded_groups: sp.excludedGroups,
    _search_query: sp.searchQuery || sp.q || undefined,
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

    console.error('Error fetching featured group counts', {
      error,
      excludedGroupCount: sp.excludedGroups.length,
      featuredGroupCount: sp.featuredGroupIds.length,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error fetching featured group counts' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    Object.fromEntries(
      (data ?? []).map((row) => [row.group_id, Number(row.user_count)])
    )
  );
}

export async function GET(request: Request, context: Params) {
  return handleRequest(
    request,
    context,
    collectSearchParams(new URL(request.url).searchParams)
  );
}

export async function POST(request: Request, context: Params) {
  return handleRequest(request, context, await readJsonObject(request));
}
