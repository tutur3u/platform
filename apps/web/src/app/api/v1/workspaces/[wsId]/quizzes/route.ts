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

const QuizOptionSchema = z.object({
  id: z.guid().optional(),
  value: z.string().trim().min(1).max(500),
  is_correct: z.boolean(),
  explanation: z.string().trim().max(2000).nullable().optional(),
});

const QuizPayloadSchema = z.object({
  id: z.guid().optional(),
  question: z.string().trim().min(1).max(4000),
  quiz_options: z.array(QuizOptionSchema).min(2),
});

const QuizCreateSchema = z.object({
  moduleId: z.guid().optional(),
  setId: z.guid().optional(),
  quizzes: z.array(QuizPayloadSchema).min(1),
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
      .from('workspace_quizzes')
      .select(
        'id, question, created_at, quiz_options(id, value, is_correct, explanation)',
        { count: 'exact' }
      )
      .eq('ws_id', access.normalizedWsId)
      .order('created_at', { ascending: false });

    if ((q?.length ?? 0) > 0) {
      queryBuilder.ilike('question', `%${q}%`);
    }

    const from = (page - 1) * pageSize;
    queryBuilder.range(from, from + pageSize - 1);

    const { data, error, count } = await queryBuilder;
    if (error) {
      console.error('Failed to fetch workspace quizzes', error);
      return NextResponse.json(
        { message: 'Error fetching workspace quizzes' },
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

    const parsedBody = QuizCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const { moduleId, setId, quizzes } = parsedBody.data;

    try {
      for (const quiz of quizzes) {
        let quizId: string;

        if (quiz.id != null) {
          const { error: updateErr } = await context.supabase
            .from('workspace_quizzes')
            .update({ question: quiz.question })
            .eq('id', quiz.id)
            .eq('ws_id', access.normalizedWsId);
          if (updateErr) throw updateErr;
          quizId = quiz.id;
        } else {
          const { data: inserted, error: insertErr } = await context.supabase
            .from('workspace_quizzes')
            .insert({
              question: quiz.question,
              ws_id: access.normalizedWsId,
            })
            .select('id')
            .single();
          if (insertErr) throw insertErr;
          quizId = inserted.id;
        }

        if (moduleId != null) {
          const { error: moduleError } = await context.supabase
            .from('course_module_quizzes')
            .insert({
              module_id: moduleId,
              quiz_id: quizId,
            });
          if (moduleError != null && moduleError.code !== '23505') {
            throw moduleError;
          }
        }

        if (setId != null) {
          const { error: setError } = await context.supabase
            .from('quiz_set_quizzes')
            .insert({
              set_id: setId,
              quiz_id: quizId,
            });
          if (setError != null && setError.code !== '23505') {
            throw setError;
          }
        }

        const { error: deleteOptionsError } = await context.supabase
          .from('quiz_options')
          .delete()
          .eq('quiz_id', quizId);
        if (deleteOptionsError) throw deleteOptionsError;

        const optionsPayload = quiz.quiz_options.map((option) => ({
          quiz_id: quizId,
          value: option.value,
          is_correct: option.is_correct,
          explanation: option.explanation ?? null,
        }));

        const { error: insertOptionsError } = await context.supabase
          .from('quiz_options')
          .insert(optionsPayload);
        if (insertOptionsError) throw insertOptionsError;
      }

      return NextResponse.json({
        message: 'All quizzes processed successfully',
      });
    } catch (error) {
      console.error('Bulk quiz error:', error);
      return NextResponse.json(
        { message: 'An error occurred processing quizzes' },
        { status: 500 }
      );
    }
  },
  { rateLimit: { windowMs: 60000, maxRequests: 60 } }
);
