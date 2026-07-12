import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
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
  includedGroups: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => normalizeListParam(value))
    .default([]),
  q: z.string().max(MAX_SEARCH_LENGTH).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  paginated: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value === true || value === 'true'),
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
  const isPaginated =
    sp.paginated ||
    rawParams.page !== undefined ||
    rawParams.pageSize !== undefined ||
    rawParams.q !== undefined;
  const sbAdmin = await createAdminClient({ noCookie: true });
  let query = sbAdmin
    .rpc(
      'get_possible_excluded_groups',
      { _ws_id: wsId, included_groups: sp.includedGroups },
      { count: isPaginated ? 'exact' : undefined }
    )
    .select('id, name, amount')
    .order('name');

  if (sp.q) query = query.ilike('name', `%${sp.q.trim()}%`);
  if (isPaginated) {
    const start = (sp.page - 1) * sp.pageSize;
    query = query.range(start, start + sp.pageSize - 1);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error('Error fetching possible excluded groups', {
      error,
      includedGroupCount: sp.includedGroups.length,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error fetching possible excluded groups' },
      { status: 500 }
    );
  }

  return isPaginated
    ? NextResponse.json({
        data: data ?? [],
        count: count ?? 0,
        pageSize: sp.pageSize,
      })
    : NextResponse.json(data ?? []);
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
