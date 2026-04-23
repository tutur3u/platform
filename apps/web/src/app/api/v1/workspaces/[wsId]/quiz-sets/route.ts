import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const RouteParamsSchema = z.object({
  wsId: z.string().min(1),
});

const QuizSetCreateSchema = z.object({
  moduleId: z.guid().optional(),
  name: z.string().trim().min(1).max(255),
});

async function validateWorkspaceAccess(
  wsId: string,
  userId: string,
  supabase: TypedSupabaseClient
) {
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const membership = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json(
      { message: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  return { normalizedWsId };
}

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

    const access = await validateWorkspaceAccess(
      parsedParams.data.wsId,
      context.user.id,
      context.supabase
    );
    if (access instanceof NextResponse) return access;

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

    const queryBuilder = context.supabase
      .from('workspace_quiz_sets')
      .select('id, name, created_at, course_module_quiz_sets(id)', {
        count: 'exact',
      })
      .eq('ws_id', access.normalizedWsId)
      .order('created_at', { ascending: false });

    if ((q?.length ?? 0) > 0) {
      queryBuilder.ilike('name', `%${q}%`);
    }

    const from = (page - 1) * pageSize;
    queryBuilder.range(from, from + pageSize - 1);

    const { data, error, count } = await queryBuilder;
    if (error) {
      console.error('Failed to fetch workspace quiz sets', error);
      return NextResponse.json(
        { message: 'Error fetching workspace quiz sets' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        created_at: item.created_at,
        linked_modules_count: item.course_module_quiz_sets?.length ?? 0,
      })),
      count: count ?? 0,
      page,
      pageSize,
    });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 120 } }
);

export const POST = withSessionAuth(
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

    const access = await validateWorkspaceAccess(
      parsedParams.data.wsId,
      context.user.id,
      context.supabase
    );
    if (access instanceof NextResponse) return access;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsedBody = QuizSetCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const { moduleId, ...payload } = parsedBody.data;
    const { data, error } = await context.supabase
      .from('workspace_quiz_sets')
      .insert({
        ...payload,
        ws_id: access.normalizedWsId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create workspace quiz set', error);
      return NextResponse.json(
        { message: 'Error creating workspace quiz set' },
        { status: 500 }
      );
    }

    if (moduleId != null) {
      const { error: linkError } = await context.supabase
        .from('course_module_quiz_sets')
        .insert({
          module_id: moduleId,
          set_id: data.id,
        });

      if (linkError) {
        console.error('Failed to link quiz set module', linkError);
        return NextResponse.json(
          { message: 'Error linking workspace quiz set to course module' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ message: 'success', id: data.id });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 60 } }
);
