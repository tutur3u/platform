import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
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
  includedGroups: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => normalizeListParam(val))
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

async function handlePossibleExcludedGroupsRequest(
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
  const isPaginated =
    sp.paginated ||
    paramsObj.page !== undefined ||
    paramsObj.pageSize !== undefined ||
    paramsObj.q !== undefined;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sbAdmin = await createAdminClient();

  let queryBuilder = sbAdmin
    .rpc(
      'get_possible_excluded_groups',
      {
        _ws_id: wsId,
        included_groups: sp.includedGroups,
      },
      {
        count: isPaginated ? 'exact' : undefined,
      }
    )
    .select('id, name, amount')
    .order('name');

  if (sp.q) {
    queryBuilder = queryBuilder.ilike('name', `%${sp.q.trim()}%`);
  }

  if (isPaginated) {
    const start = (sp.page - 1) * sp.pageSize;
    const end = sp.page * sp.pageSize - 1;
    queryBuilder = queryBuilder.range(start, end);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error(
      'Error fetching possible excluded groups',
      {
        includedGroupCount: sp.includedGroups.length,
        wsId,
      },
      error
    );
    return NextResponse.json(
      { message: 'Error fetching possible excluded groups' },
      { status: 500 }
    );
  }

  if (isPaginated) {
    return NextResponse.json({
      data: data || [],
      count: count ?? 0,
      pageSize: sp.pageSize,
    });
  }

  return NextResponse.json(data || []);
}

export async function GET(req: Request, context: Params) {
  const { searchParams } = new URL(req.url);

  return withRequestLogDrain(
    {
      request: req,
      route: '/api/v1/workspaces/[wsId]/users/groups/possible-excluded',
    },
    () =>
      handlePossibleExcludedGroupsRequest(
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
      route: '/api/v1/workspaces/[wsId]/users/groups/possible-excluded',
    },
    async () =>
      handlePossibleExcludedGroupsRequest(
        req,
        context,
        await readJsonObject(req)
      )
  );
}
