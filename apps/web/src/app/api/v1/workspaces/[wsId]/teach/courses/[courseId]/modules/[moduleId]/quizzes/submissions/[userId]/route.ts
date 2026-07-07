import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { updateModuleCompletionStatus } from '@/lib/tulearn/completion';
import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
  validateTeachCourseModule,
} from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  moduleId: z.guid(),
  userId: z.guid(),
  wsId: z.string().min(1),
});

type SubmissionQuiz = {
  content: Json | null;
  id: string;
  question: string | null;
  quiz_options: {
    explanation?: string | null;
    id: string;
    is_correct?: boolean | null;
    value: string | null;
  }[];
  score: number | null;
  type: string | null;
};

type ModuleQuizJoinRow = {
  workspace_quizzes: SubmissionQuiz | SubmissionQuiz[] | null;
};

type SubmissionAnswer = {
  answer: unknown;
  created_at: string;
  is_correct: boolean | null;
  feedback?: string | null;
  ai_feedback?: string | null;
  quiz_id: string;
  selected_option_id: string | null;
};

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function extractEmail(
  value:
    | {
        email?: string | null;
      }
    | {
        email?: string | null;
      }[]
    | null
    | undefined
) {
  if (Array.isArray(value)) return value[0]?.email ?? null;
  return value?.email ?? null;
}

export const GET_inner = async (
  _request: any,
  context: any,
  params:
    | { wsId: string; courseId: string; moduleId: string; userId: string }
    | Promise<{
        wsId: string;
        courseId: string;
        moduleId: string;
        userId: string;
      }>
) => {
  try {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        {
          message: 'Invalid route params',
          errors: parsedParams.error.issues,
        },
        { status: 400 }
      );
    }

    const { wsId, courseId, moduleId, userId } = parsedParams.data;

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

    const module = await validateTeachCourseModule({
      courseId,
      db: access.sbAdmin,
      moduleId,
    });
    if (!module) {
      return NextResponse.json(
        { message: 'Module not found' },
        { status: 404 }
      );
    }

    const { data: answers, error: answersErr } = await access.sbAdmin
      .from('course_module_quiz_submissions')
      .select('quiz_id, selected_option_id, answer, is_correct, feedback, ai_feedback, created_at')
      .eq('module_id', moduleId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (answersErr) throw answersErr;
    if (!answers || answers.length === 0) {
      return NextResponse.json(
        { message: 'Submission not found' },
        { status: 404 }
      );
    }

    const { data: studentProfile, error: studentErr } = await access.sbAdmin
      .from('users')
      .select('id, display_name, avatar_url, user_private_details(email)')
      .eq('id', userId)
      .maybeSingle();

    if (studentErr) throw studentErr;

    const { data: moduleQuizzes, error: moduleQuizzesErr } =
      await access.sbAdmin
        .from('course_module_quizzes')
        .select(
          'workspace_quizzes!inner(id, question, type, content, score, quiz_options(id, value, is_correct, explanation))'
        )
        .eq('module_id', moduleId)
        .order('created_at', { ascending: true });

    if (moduleQuizzesErr) throw moduleQuizzesErr;

    const quizzes = ((moduleQuizzes ?? []) as ModuleQuizJoinRow[])
      .map((row) => firstJoined(row.workspace_quizzes))
      .filter((quiz): quiz is SubmissionQuiz => Boolean(quiz));

    const typedAnswers = answers as SubmissionAnswer[];
    const answeredCount = typedAnswers.length;
    const correctCount = typedAnswers.filter(
      (answer) => answer.is_correct === true
    ).length;
    const unmarkedCount = typedAnswers.filter(
      (answer) => answer.is_correct === null
    ).length;

    const student = studentProfile
      ? {
          avatar_url: studentProfile.avatar_url,
          display_name: studentProfile.display_name,
          email: extractEmail(studentProfile.user_private_details),
          id: studentProfile.id,
        }
      : {
          avatar_url: null,
          display_name: 'Unknown Student',
          email: null,
          id: userId,
        };

    return NextResponse.json({
      answers: typedAnswers,
      quizzes,
      student,
      summary: {
        answeredCount,
        correctCount,
        unmarkedCount,
        firstSubmittedAt: typedAnswers[0]?.created_at ?? null,
        lastSubmittedAt:
          typedAnswers[typedAnswers.length - 1]?.created_at ?? null,
        totalQuizzes: quizzes.length,
      },
    });
  } catch (error) {
    console.error('Failed to load module quiz submission detail:', error);
    return NextResponse.json(
      { message: 'Failed to load module quiz submission detail' },
      { status: 500 }
    );
  }
};

export const GET = withSessionAuth(GET_inner, {
  allowAppSessionAuth: { targetApp: 'teach' },
  rateLimit: { maxRequests: 120, windowMs: 60000 },
});

const GradePayloadSchema = z.object({
  quizId: z.guid(),
  isCorrect: z.boolean(),
  feedback: z.string().optional(),
});

export const POST = withSessionAuth(
  async (
    request,
    context,
    params:
      | { wsId: string; courseId: string; moduleId: string; userId: string }
      | Promise<{
          wsId: string;
          courseId: string;
          moduleId: string;
          userId: string;
        }>
  ) => {
    try {
      const parsedParams = RouteParamsSchema.safeParse(await params);
      if (!parsedParams.success) {
        return NextResponse.json(
          {
            message: 'Invalid route params',
            errors: parsedParams.error.issues,
          },
          { status: 400 }
        );
      }

      const { wsId, courseId, moduleId, userId } = parsedParams.data;

      const access = await requireTeachWorkspaceAccess({
        context,
        permission: 'manage_users',
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

      const module = await validateTeachCourseModule({
        courseId,
        db: access.sbAdmin,
        moduleId,
      });
      if (!module) {
        return NextResponse.json(
          { message: 'Module not found' },
          { status: 404 }
        );
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { message: 'Invalid request body' },
          { status: 400 }
        );
      }

      const parsedBody = GradePayloadSchema.safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json(
          {
            message: 'Invalid request body',
            errors: parsedBody.error.issues,
          },
          { status: 400 }
        );
      }

      const { quizId, isCorrect, feedback } = parsedBody.data;

      const { error: updateErr } = await access.sbAdmin
        .from('course_module_quiz_submissions')
        .update({
          is_correct: isCorrect,
          feedback: feedback ?? null,
        })
        .eq('module_id', moduleId)
        .eq('quiz_id', quizId)
        .eq('user_id', userId);

      if (updateErr) throw updateErr;

      await updateModuleCompletionStatus(
        access.sbAdmin,
        moduleId,
        userId
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Failed to grade module quiz submission:', error);
      return NextResponse.json(
        { message: 'Failed to grade module quiz submission' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 120, windowMs: 60000 },
  }
);
