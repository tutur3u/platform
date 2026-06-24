import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { JsonPayloadSchema } from '@/lib/education/json-payload-schema';
import { attachPrivateWorkspaceQuizAnswers } from '@/lib/education/private-quiz-answers';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  testId: z.guid(),
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
  'paragraph',
]);

const QuizPayloadSchema = z.object({
  id: z.guid().optional(),
  question: z.string().trim().min(1).max(4000),
  quiz_options: z.array(QuizOptionSchema).optional(),
  type: QuizTypeSchema.optional(),
  content: JsonPayloadSchema.optional(),
  answer: JsonPayloadSchema.optional(),
});

const QuizCreateSchema = z.object({
  moduleId: z.guid(),
  quizzes: z.array(QuizPayloadSchema).min(1),
});

type UntypedRpcClient = {
  rpc<T>(
    fn: string,
    args: Record<string, unknown>
  ): Promise<{
    data: T | null;
    error: { code?: string; message?: string } | null;
  }>;
};

async function validateCourseTest({
  access,
  courseId,
  testId,
}: {
  access: Exclude<
    Awaited<ReturnType<typeof requireTeachWorkspaceAccess>>,
    NextResponse
  >;
  courseId: string;
  testId: string;
}) {
  const { data, error } = await access.sbAdmin
    .from('course_tests')
    .select('id')
    .eq('id', testId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to validate course test', {
      courseId,
      error,
      testId,
      wsId: access.normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Error validating course test' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Test not found' }, { status: 404 });
  }

  return null;
}

async function validateCourseTestModule({
  access,
  moduleId,
  testId,
}: {
  access: Exclude<
    Awaited<ReturnType<typeof requireTeachWorkspaceAccess>>,
    NextResponse
  >;
  moduleId: string;
  testId: string;
}) {
  const { data, error } = await access.sbAdmin
    .from('course_test_modules')
    .select('module_id')
    .eq('test_id', testId)
    .eq('module_id', moduleId)
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to validate course test module', {
      error,
      moduleId,
      testId,
      wsId: access.normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Error validating course test module' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Module not found for test' },
      { status: 404 }
    );
  }

  return null;
}

export const GET = withSessionAuth(
  async (
    request,
    context,
    params:
      | { wsId: string; courseId: string; testId: string }
      | Promise<{ wsId: string; courseId: string; testId: string }>
  ) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const { wsId, courseId, testId } = parsedParams.data;

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'view_user_groups',
      wsId,
    });
    if (access instanceof NextResponse) return access;

    const course = await validateTeachCourse({
      courseId,
      db: access.sbAdmin,
      wsId: access.normalizedWsId,
    });
    if (!course) {
      return NextResponse.json(
        { message: 'Course not found' },
        { status: 404 }
      );
    }

    const testValidationError = await validateCourseTest({
      access,
      courseId,
      testId,
    });
    if (testValidationError) return testValidationError;

    const rawModuleId = request.nextUrl.searchParams.get('moduleId')?.trim();
    const parsedModuleId = rawModuleId ? z.guid().safeParse(rawModuleId) : null;
    if (parsedModuleId && !parsedModuleId.success) {
      return NextResponse.json(
        { message: 'Invalid module id', errors: parsedModuleId.error.issues },
        { status: 400 }
      );
    }
    const moduleId = parsedModuleId?.data;

    if (moduleId) {
      const moduleValidationError = await validateCourseTestModule({
        access,
        moduleId,
        testId,
      });
      if (moduleValidationError) return moduleValidationError;
    }

    // Query course_test_quizzes for linked quiz ids
    const query = access.sbAdmin
      .from('course_test_quizzes')
      .select('quiz_id')
      .eq('test_id', testId);

    if (moduleId) {
      query.eq('module_id', moduleId);
    }

    const { data: testQuizzes, error: tqErr } = await query;
    if (tqErr) {
      serverLogger.error('Failed to fetch course test quizzes link', {
        error: tqErr,
        testId,
        wsId: access.normalizedWsId,
      });
      return NextResponse.json(
        { message: 'Error fetching course test quizzes connection' },
        { status: 500 }
      );
    }

    const quizIds = (testQuizzes ?? []).map((tq) => tq.quiz_id);
    if (quizIds.length === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
      });
    }

    // Retrieve full quiz details
    const { data, error, count } = await access.sbAdmin
      .from('workspace_quizzes')
      .select(
        'id, question, type, content, answer, created_at, quiz_options(id, value, is_correct, explanation)',
        { count: 'exact' }
      )
      .eq('ws_id', access.normalizedWsId)
      .in('id', quizIds)
      .order('created_at', { ascending: false });

    if (error) {
      serverLogger.error('Failed to fetch workspace quizzes for test', {
        error,
        wsId: access.normalizedWsId,
      });
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
    params:
      | { wsId: string; courseId: string; testId: string }
      | Promise<{ wsId: string; courseId: string; testId: string }>
  ) => {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { message: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const { wsId, courseId, testId } = parsedParams.data;

    const access = await requireTeachWorkspaceAccess({
      context,
      permission: 'update_user_groups',
      wsId,
    });
    if (access instanceof NextResponse) return access;

    const course = await validateTeachCourse({
      courseId,
      db: access.sbAdmin,
      wsId: access.normalizedWsId,
    });
    if (!course) {
      return NextResponse.json(
        { message: 'Course not found' },
        { status: 404 }
      );
    }

    const testValidationError = await validateCourseTest({
      access,
      courseId,
      testId,
    });
    if (testValidationError) return testValidationError;

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

    const { moduleId, quizzes } = parsedBody.data;

    const moduleValidationError = await validateCourseTestModule({
      access,
      moduleId,
      testId,
    });
    if (moduleValidationError) return moduleValidationError;

    try {
      const rpcClient = access.sbAdmin as unknown as UntypedRpcClient;

      for (const quiz of quizzes) {
        const { error } = await rpcClient.rpc<string>(
          'upsert_course_test_question',
          {
            p_module_id: moduleId,
            p_quiz: quiz,
            p_test_id: testId,
            p_ws_id: access.normalizedWsId,
          }
        );

        if (error?.code === 'P0002') {
          return NextResponse.json(
            { message: 'Quiz not found' },
            { status: 404 }
          );
        }
        if (error) throw error;
      }

      return NextResponse.json({
        message: 'All test questions processed successfully',
      });
    } catch (error) {
      serverLogger.error('Bulk test question error', { error });
      return NextResponse.json(
        { message: 'An error occurred processing test questions' },
        { status: 500 }
      );
    }
  },
  {
    rateLimit: { windowMs: 60000, maxRequests: 60 },
    allowAppSessionAuth: { targetApp: 'teach' },
  }
);
