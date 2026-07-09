import { requireEducationWorkspaceAccess } from '@tuturuuu/education-core/education/access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const RouteParamsSchema = z.object({
  setId: z.guid(),
  wsId: z.string().min(1),
});

/**
 * Lists the course modules linked to a quiz set. Mirrors the legacy
 * server-component `getData` (admin read of `course_module_quiz_sets` spreading
 * `workspace_course_modules`), gated through `requireEducationWorkspaceAccess`.
 */
export const GET = withSessionAuth(
  async (
    request,
    context,
    params:
      | { wsId: string; setId: string }
      | Promise<{ wsId: string; setId: string }>
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
    const { sbAdmin } = access;

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
      .from('course_module_quiz_sets')
      .select(
        'id:module_id, ...workspace_course_modules(group_id, name, is_public, is_published)',
        { count: 'exact' }
      )
      .eq('set_id', parsedParams.data.setId)
      .order('created_at', { ascending: false });

    if ((q?.length ?? 0) > 0) {
      queryBuilder.ilike('workspace_course_modules.name', `%${q}%`);
    }

    const from = (page - 1) * pageSize;
    queryBuilder.range(from, from + pageSize - 1);

    const { data, error, count } = await queryBuilder;
    if (error) {
      console.error('Failed to fetch quiz set linked modules', error);
      return NextResponse.json(
        { message: 'Error fetching quiz set linked modules' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data ?? [],
      count: count ?? 0,
      page,
      pageSize,
    });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 120 } }
);
