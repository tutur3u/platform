import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { requireEducationWorkspaceAccess } from '@/lib/education/access';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const RouteParamsSchema = z.object({
  setId: z.guid(),
  wsId: z.string().min(1),
});

/**
 * Lists the quizzes (with their options) that belong to a quiz set. Mirrors the
 * legacy server-component `getData` (admin read of `quiz_set_quizzes` spreading
 * `workspace_quizzes(*, quiz_options(*))`), gated through
 * `requireEducationWorkspaceAccess`.
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
      .from('quiz_set_quizzes')
      .select('...workspace_quizzes(*, quiz_options(*))', { count: 'exact' })
      .eq('set_id', parsedParams.data.setId)
      .order('created_at', { ascending: false });

    if ((q?.length ?? 0) > 0) {
      queryBuilder.ilike('question', `%${q}%`);
    }

    const from = (page - 1) * pageSize;
    queryBuilder.range(from, from + pageSize - 1);

    const { data, error, count } = await queryBuilder;
    if (error) {
      console.error('Failed to fetch quiz set quizzes', error);
      return NextResponse.json(
        { message: 'Error fetching quiz set quizzes' },
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
