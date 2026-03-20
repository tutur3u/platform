import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SearchParamsSchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  paginated: z.enum(['true', 'false']).optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const { searchParams } = new URL(req.url);
  const includedGroups = searchParams.getAll('includedGroups');
  const spResult = SearchParamsSchema.safeParse(
    Object.fromEntries(searchParams)
  );

  if (!spResult.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', issues: spResult.error.issues },
      { status: 400 }
    );
  }

  const sp = spResult.data;
  const isPaginated =
    sp.paginated === 'true' ||
    searchParams.has('page') ||
    searchParams.has('pageSize') ||
    searchParams.has('q');

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
        included_groups: includedGroups,
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
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching possible excluded groups' },
      { status: 500 }
    );
  }

  if (isPaginated) {
    return NextResponse.json({
      data: data || [],
      count: count ?? 0,
    });
  }

  return NextResponse.json(data || []);
}
