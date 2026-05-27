import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
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

const QuizUpdateSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  quiz_options: z.array(QuizOptionSchema).optional(),
  type: z.string().optional(),
  content: z.any().optional(),
  answer: z.any().optional(),
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

    const updateData: any = { question: parsedBody.data.question };
    if (parsedBody.data.type !== undefined)
      updateData.type = parsedBody.data.type;
    if (parsedBody.data.content !== undefined)
      updateData.content = parsedBody.data.content;
    if (parsedBody.data.answer !== undefined)
      updateData.answer = parsedBody.data.answer;

    const { data, error } = await access.sbAdmin
      .from('workspace_quizzes')
      .update(updateData)
      .eq('id', parsedParams.data.quizId)
      .eq('ws_id', access.normalizedWsId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to update workspace quiz', error);
      return NextResponse.json(
        { message: 'Error updating workspace quiz' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ message: 'Quiz not found' }, { status: 404 });
    }

    const { error: deleteOptionsError } = await access.sbAdmin
      .from('quiz_options')
      .delete()
      .eq('quiz_id', parsedParams.data.quizId);

    if (deleteOptionsError) {
      console.error('Failed to reset quiz options', deleteOptionsError);
      return NextResponse.json(
        { message: 'Error updating workspace quiz options' },
        { status: 500 }
      );
    }

    if (
      parsedBody.data.quiz_options != null &&
      parsedBody.data.quiz_options.length > 0
    ) {
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
        console.error('Failed to insert quiz options', insertOptionsError);
        return NextResponse.json(
          { message: 'Error updating workspace quiz options' },
          { status: 500 }
        );
      }
    }

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

    const { data, error } = await access.sbAdmin
      .from('workspace_quizzes')
      .delete()
      .eq('id', parsedParams.data.quizId)
      .eq('ws_id', access.normalizedWsId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to delete workspace quiz', error);
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
