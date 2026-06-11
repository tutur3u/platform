import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  attachPrivateWorkspaceQuizAnswers,
  setPrivateWorkspaceQuizAnswer,
} from '@/lib/education/private-quiz-answers';
import { revalidateCourseModuleQuizPaths } from '@/lib/education/revalidate-quiz-paths';
import { requireTeachWorkspaceAccess } from '@/lib/teach/api';

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
const QuizTypeSchema = z.enum([
  'true_false',
  'multiple_choice',
  'matching',
  'ordering',
]);
const JsonPayloadSchema = z.custom<Json>();

type QuizMutationData = {
  question: string;
  content?: Json;
  type?: z.infer<typeof QuizTypeSchema>;
};

const QuizPayloadSchema = z.object({
  id: z.guid().optional(),
  question: z.string().trim().min(1).max(4000),
  quiz_options: z.array(QuizOptionSchema).optional(),
  type: QuizTypeSchema.optional(),
  content: JsonPayloadSchema.optional(),
  answer: JsonPayloadSchema.optional(),
});

const QuizCreateSchema = z.object({
  moduleId: z.guid().optional(),
  setId: z.guid().optional(),
  quizzes: z.array(QuizPayloadSchema).min(1),
});

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

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'update_user_groups',
      wsId: parsedParams.data.wsId,
    });
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

    const moduleId = request.nextUrl.searchParams.get('moduleId')?.trim();

    const queryBuilder = access.sbAdmin
      .from('workspace_quizzes')
      .select(
        'id, question, type, content, answer, created_at, quiz_options(id, value, is_correct, explanation)',
        { count: 'exact' }
      )
      .eq('ws_id', access.normalizedWsId)
      .order('created_at', { ascending: false });

    if (moduleId) {
      const { data: moduleQuizzes, error: mqErr } = await access.sbAdmin
        .from('course_module_quizzes')
        .select('quiz_id')
        .eq('module_id', moduleId);

      if (mqErr) {
        console.error('Failed to fetch course module quizzes', mqErr);
        return NextResponse.json(
          { message: 'Error fetching course module quizzes' },
          { status: 500 }
        );
      }

      const quizIds = (moduleQuizzes ?? []).map((mq) => mq.quiz_id);
      if (quizIds.length === 0) {
        return NextResponse.json({
          data: [],
          count: 0,
          page,
          pageSize,
        });
      }
      queryBuilder.in('id', quizIds);
    }

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

    const quizzes = await attachPrivateWorkspaceQuizAnswers(
      access.sbAdmin,
      data ?? []
    );

    return NextResponse.json({
      data: quizzes,
      count: count ?? 0,
      page,
      pageSize,
    });
  },
  {
    rateLimit: { windowMs: 60000, maxRequests: 120 },
    allowAppSessionAuth: { targetApp: 'teach' },
  }
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

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'update_user_groups',
      wsId: parsedParams.data.wsId,
    });
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

        const updateData: QuizMutationData = { question: quiz.question };
        if (quiz.type !== undefined) updateData.type = quiz.type;
        if (quiz.content !== undefined) updateData.content = quiz.content;

        if (quiz.id != null) {
          const { data: updated, error: updateErr } = await access.sbAdmin
            .from('workspace_quizzes')
            .update(updateData)
            .eq('id', quiz.id)
            .eq('ws_id', access.normalizedWsId)
            .select('id')
            .maybeSingle();
          if (updateErr) throw updateErr;
          if (!updated) {
            return NextResponse.json(
              { message: 'Quiz not found' },
              { status: 404 }
            );
          }
          quizId = updated.id;
        } else {
          const insertData: QuizMutationData & { ws_id: string } = {
            question: quiz.question,
            ws_id: access.normalizedWsId,
          };
          if (quiz.type !== undefined) insertData.type = quiz.type;
          if (quiz.content !== undefined) insertData.content = quiz.content;

          const { data: inserted, error: insertErr } = await access.sbAdmin
            .from('workspace_quizzes')
            .insert(insertData)
            .select('id')
            .single();
          if (insertErr) throw insertErr;
          quizId = inserted.id;
        }

        await setPrivateWorkspaceQuizAnswer({
          answer: quiz.answer,
          db: access.sbAdmin,
          quizId,
        });

        if (moduleId != null) {
          const { error: moduleError } = await access.sbAdmin
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
          const { error: setError } = await access.sbAdmin
            .from('quiz_set_quizzes')
            .insert({
              set_id: setId,
              quiz_id: quizId,
            });
          if (setError != null && setError.code !== '23505') {
            throw setError;
          }
        }

        if (quiz.quiz_options !== undefined) {
          const { error: deleteOptionsError } = await access.sbAdmin
            .from('quiz_options')
            .delete()
            .eq('quiz_id', quizId);
          if (deleteOptionsError) throw deleteOptionsError;

          if (quiz.quiz_options.length > 0) {
            const optionsPayload = quiz.quiz_options.map((option) => ({
              quiz_id: quizId,
              value: option.value,
              is_correct: option.is_correct,
              explanation: option.explanation ?? null,
            }));

            const { error: insertOptionsError } = await access.sbAdmin
              .from('quiz_options')
              .insert(optionsPayload);
            if (insertOptionsError) throw insertOptionsError;
          }
        }
      }

      if (moduleId != null) {
        await revalidateCourseModuleQuizPaths({
          db: access.sbAdmin,
          moduleIds: [moduleId],
          wsId: access.normalizedWsId,
        });
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
  {
    rateLimit: { windowMs: 60000, maxRequests: 60 },
    allowAppSessionAuth: { targetApp: 'teach' },
  }
);
