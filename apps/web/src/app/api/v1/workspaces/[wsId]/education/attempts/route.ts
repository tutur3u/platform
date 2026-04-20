import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

interface RouteParams {
  wsId: string;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export const GET = withSessionAuth(
  async (request, context, params: RouteParams | Promise<RouteParams>) => {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId, context.supabase);

    const { data: membership, error: membershipError } = await context.supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', context.user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { message: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

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

    const setId = request.nextUrl.searchParams.get('setId')?.trim();
    const learnerId = request.nextUrl.searchParams.get('learnerId')?.trim();
    const status = request.nextUrl.searchParams.get('status')?.trim();
    const dateFrom = request.nextUrl.searchParams.get('dateFrom')?.trim();
    const dateTo = request.nextUrl.searchParams.get('dateTo')?.trim();
    const sortBy = request.nextUrl.searchParams.get('sortBy')?.trim();
    const sortDirection = request.nextUrl.searchParams
      .get('sortDirection')
      ?.trim();

    const sbAdmin = await createAdminClient();
    const queryBuilder = sbAdmin
      .from('workspace_quiz_attempts')
      .select(
        'id, attempt_number, started_at, submitted_at, completed_at, duration_seconds, total_score, set_id, user_id, workspace_quiz_sets!inner(id, name, ws_id)',
        { count: 'exact' }
      )
      .eq('workspace_quiz_sets.ws_id', normalizedWsId);

    if (setId) queryBuilder.eq('set_id', setId);
    if (learnerId) queryBuilder.eq('user_id', learnerId);
    if (status === 'completed') queryBuilder.not('completed_at', 'is', null);
    if (status === 'incomplete') queryBuilder.is('completed_at', null);
    if (dateFrom) queryBuilder.gte('submitted_at', dateFrom);
    if (dateTo) queryBuilder.lte('submitted_at', dateTo);

    if (sortBy === 'score') {
      queryBuilder.order('total_score', { ascending: sortDirection === 'asc' });
    } else if (sortBy === 'duration') {
      queryBuilder.order('duration_seconds', {
        ascending: sortDirection === 'asc',
      });
    } else {
      queryBuilder.order('submitted_at', {
        ascending: sortDirection === 'asc',
      });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    queryBuilder.range(from, to);

    const { data, error, count } = await queryBuilder;
    if (error) {
      return NextResponse.json(
        { message: 'Failed to fetch attempts' },
        { status: 500 }
      );
    }

    const attempts = data ?? [];
    const learnerIds = [...new Set(attempts.map((attempt) => attempt.user_id))];
    const setIds = [...new Set(attempts.map((attempt) => attempt.set_id))];

    const [learnersResponse, setsResponse] = await Promise.all([
      learnerIds.length
        ? sbAdmin
            .from('user_private_details')
            .select('user_id, full_name, email')
            .in('user_id', learnerIds)
        : Promise.resolve({ data: [], error: null }),
      sbAdmin
        .from('workspace_quiz_sets')
        .select('id, name')
        .eq('ws_id', normalizedWsId)
        .order('name'),
    ]);

    if (learnersResponse.error) {
      return NextResponse.json(
        { message: 'Failed to fetch learner metadata' },
        { status: 500 }
      );
    }

    if (setsResponse.error) {
      return NextResponse.json(
        { message: 'Failed to fetch quiz sets' },
        { status: 500 }
      );
    }

    const learnerById = new Map(
      (learnersResponse.data ?? []).map((learner) => [learner.user_id, learner])
    );

    const payload = attempts.map((attempt) => {
      const learner = learnerById.get(attempt.user_id);
      const joinedSet = Array.isArray(attempt.workspace_quiz_sets)
        ? attempt.workspace_quiz_sets[0]
        : attempt.workspace_quiz_sets;

      return {
        id: attempt.id,
        attempt_number: attempt.attempt_number,
        started_at: attempt.started_at,
        submitted_at: attempt.submitted_at,
        completed_at: attempt.completed_at,
        duration_seconds: attempt.duration_seconds,
        total_score: attempt.total_score,
        set_id: attempt.set_id,
        set_name: joinedSet?.name ?? null,
        user_id: attempt.user_id,
        learner_name: learner?.full_name ?? null,
        learner_email: learner?.email ?? null,
      };
    });

    return NextResponse.json({
      page,
      pageSize,
      count: count ?? 0,
      attempts: payload,
      filters: {
        learners: (learnersResponse.data ?? []).map((learner) => ({
          user_id: learner.user_id,
          full_name: learner.full_name,
          email: learner.email,
        })),
        sets: (setsResponse.data ?? []).map((quizSet) => ({
          id: quizSet.id,
          name: quizSet.name,
        })),
        selected: {
          setId: setId ?? null,
          learnerId: learnerId ?? null,
          status: status ?? 'all',
          dateFrom: dateFrom ?? null,
          dateTo: dateTo ?? null,
          sortBy: sortBy ?? 'newest',
          sortDirection: sortDirection ?? 'desc',
        },
      },
      includedSetIds: setIds,
    });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 120 } }
);
