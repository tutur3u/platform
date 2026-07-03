import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { requireEducationWorkspaceAccess } from '@/lib/education/access';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const RouteParamsSchema = z.object({
  wsId: z.string().min(1),
});

/**
 * Lists every course module in a workspace (across all course groups). Mirrors
 * the legacy server-component `getModules` admin read of
 * `workspace_course_modules` joined to `workspace_user_groups` on `ws_id`,
 * gated through `requireEducationWorkspaceAccess`.
 */
export const GET = withSessionAuth(
  async (
    request,
    context,
    params: { wsId: string } | Promise<{ wsId: string }>
  ) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const access = await requireEducationWorkspaceAccess({
      context,
      wsId: parsedParams.data.wsId,
    });
    if (access instanceof NextResponse) return access;
    const { normalizedWsId, sbAdmin } = access;

    const q = request.nextUrl.searchParams.get('q')?.trim();
    const page = Math.max(
      Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1,
      1
    );
    const pageSize = Math.min(
      Math.max(
        Number.parseInt(
          request.nextUrl.searchParams.get('pageSize') ??
            `${DEFAULT_PAGE_SIZE}`,
          10
        ) || DEFAULT_PAGE_SIZE,
        1
      ),
      MAX_PAGE_SIZE
    );

    const queryBuilder = sbAdmin
      .from('workspace_course_modules')
      .select(
        'id, name, is_public, is_published, workspace_user_groups!inner(ws_id)',
        {
          count: 'exact',
        }
      )
      .eq('workspace_user_groups.ws_id', normalizedWsId)
      .order('created_at', { ascending: false });

    if ((q?.length ?? 0) > 0) {
      queryBuilder.ilike('name', `%${q}%`);
    }

    const from = (page - 1) * pageSize;
    queryBuilder.range(from, from + pageSize - 1);

    const { data, error, count } = await queryBuilder;
    if (error) {
      console.error('Failed to fetch workspace course modules', error);
      return NextResponse.json(
        { message: 'Error fetching workspace course modules' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: (data ?? []).map(
        (item: {
          id: string;
          name: string | null;
          is_public: boolean | null;
          is_published: boolean | null;
        }) => ({
          id: item.id,
          name: item.name,
          is_public: item.is_public,
          is_published: item.is_published,
        })
      ),
      count: count ?? 0,
      page,
      pageSize,
    });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 120 } }
);
