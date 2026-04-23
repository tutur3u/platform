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

const FlashcardCreateSchema = z.object({
  moduleId: z.guid().optional(),
  front: z.string().trim().min(1).max(4000),
  back: z.string().trim().min(1).max(4000),
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
      .from('workspace_flashcards')
      .select('id, front, back, created_at', { count: 'exact' })
      .eq('ws_id', access.normalizedWsId)
      .order('created_at', { ascending: false });

    if ((q?.length ?? 0) > 0) {
      queryBuilder.or(`front.ilike.%${q}%,back.ilike.%${q}%`);
    }

    const from = (page - 1) * pageSize;
    queryBuilder.range(from, from + pageSize - 1);

    const { data, error, count } = await queryBuilder;
    if (error) {
      console.error('Failed to fetch workspace flashcards', error);
      return NextResponse.json(
        { message: 'Error fetching workspace flashcards' },
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

    const parsedBody = FlashcardCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const { moduleId, ...payload } = parsedBody.data;
    const { data, error } = await context.supabase
      .from('workspace_flashcards')
      .insert({
        ...payload,
        ws_id: access.normalizedWsId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create workspace flashcard', error);
      return NextResponse.json(
        { message: 'Error creating workspace flashcard' },
        { status: 500 }
      );
    }

    if (moduleId != null) {
      const { error: linkError } = await context.supabase
        .from('course_module_flashcards')
        .insert({
          module_id: moduleId,
          flashcard_id: data.id,
        });
      if (linkError) {
        console.error('Failed to link flashcard module', linkError);
        return NextResponse.json(
          { message: 'Error linking workspace flashcard to course module' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ message: 'success', id: data.id });
  },
  { rateLimit: { windowMs: 60000, maxRequests: 60 } }
);
