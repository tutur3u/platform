import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { JsonPayloadSchema } from '@/lib/education/json-payload-schema';
import { setPrivateWorkspaceQuizAnswer } from '@/lib/education/private-quiz-answers';
import { revalidateQuizLinkedModulePaths } from '@/lib/education/revalidate-quiz-paths';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireTeachWorkspaceAccess } from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  quizId: z.guid(),
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

type QuizMutationData = {
  question: string;
  content?: Json;
  type?: z.infer<typeof QuizTypeSchema>;
};

const QuizUpdateSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  quiz_options: z.array(QuizOptionSchema).optional(),
  type: QuizTypeSchema.optional(),
  content: JsonPayloadSchema.optional(),
  answer: JsonPayloadSchema.optional(),
});

export const PUT = withSessionAuth(
  async (
    request,
    context,
    params:
      | { wsId: string; quizId: string }
      | Promise<{ wsId: string; quizId: string }>
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

    const parsedBody = QuizUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const updateData: QuizMutationData = { question: parsedBody.data.question };
    if (parsedBody.data.type !== undefined)
      updateData.type = parsedBody.data.type;
    if (parsedBody.data.content !== undefined)
      updateData.content = parsedBody.data.content;

    const { data, error } = await access.sbAdmin
      .from('workspace_quizzes')
      .update(updateData)
      .eq('id', parsedParams.data.quizId)
      .eq('ws_id', access.normalizedWsId)
      .select('id')
      .maybeSingle();

    if (error) {
      serverLogger.error('Failed to update workspace quiz', {
        error,
        quizId: parsedParams.data.quizId,
        wsId: access.normalizedWsId,
      });
      return NextResponse.json(
        { message: 'Error updating workspace quiz' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ message: 'Quiz not found' }, { status: 404 });
    }

    await setPrivateWorkspaceQuizAnswer({
      answer: parsedBody.data.answer,
      db: access.sbAdmin,
      quizId: parsedParams.data.quizId,
    });

    if (parsedBody.data.quiz_options !== undefined) {
      const { error: deleteOptionsError } = await access.sbAdmin
        .from('quiz_options')
        .delete()
        .eq('quiz_id', parsedParams.data.quizId);

      if (deleteOptionsError) {
        serverLogger.error('Failed to reset quiz options', {
          error: deleteOptionsError,
          quizId: parsedParams.data.quizId,
          wsId: access.normalizedWsId,
        });
        return NextResponse.json(
          { message: 'Error updating workspace quiz options' },
          { status: 500 }
        );
      }

      if (parsedBody.data.quiz_options.length > 0) {
        const { error: insertOptionsError } = await access.sbAdmin
          .from('quiz_options')
          .insert(
            parsedBody.data.quiz_options.map((option) => ({
              quiz_id: parsedParams.data.quizId,
              value: option.value,
              is_correct: option.is_correct,
              explanation: option.explanation ?? null,
            }))
          );

        if (insertOptionsError) {
          serverLogger.error('Failed to insert quiz options', {
            error: insertOptionsError,
            quizId: parsedParams.data.quizId,
            wsId: access.normalizedWsId,
          });
          return NextResponse.json(
            { message: 'Error updating workspace quiz options' },
            { status: 500 }
          );
        }
      }
    }

    await revalidateQuizLinkedModulePaths({
      db: access.sbAdmin,
      quizId: parsedParams.data.quizId,
      wsId: access.normalizedWsId,
    });

    return NextResponse.json({ message: 'success' });
  },
  {
    rateLimit: { windowMs: 60000, maxRequests: 60 },
    allowAppSessionAuth: { targetApp: 'teach' },
  }
);

export const DELETE = withSessionAuth(
  async (
    _request,
    context,
    params:
      | { wsId: string; quizId: string }
      | Promise<{ wsId: string; quizId: string }>
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

    await revalidateQuizLinkedModulePaths({
      db: access.sbAdmin,
      quizId: parsedParams.data.quizId,
      wsId: access.normalizedWsId,
    });

    const { data, error } = await access.sbAdmin
      .from('workspace_quizzes')
      .delete()
      .eq('id', parsedParams.data.quizId)
      .eq('ws_id', access.normalizedWsId)
      .select('id')
      .maybeSingle();

    if (error) {
      serverLogger.error('Failed to delete workspace quiz', {
        error,
        quizId: parsedParams.data.quizId,
        wsId: access.normalizedWsId,
      });
      return NextResponse.json(
        { message: 'Error deleting workspace quiz' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ message: 'Quiz not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'success' });
  },
  {
    rateLimit: { windowMs: 60000, maxRequests: 60 },
    allowAppSessionAuth: { targetApp: 'teach' },
  }
);
