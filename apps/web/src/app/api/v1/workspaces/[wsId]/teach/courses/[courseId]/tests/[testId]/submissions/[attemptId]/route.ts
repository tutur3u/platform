import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  testId: z.guid(),
  wsId: z.string().min(1),
  attemptId: z.guid(),
});

const UpdateFeedbackSchema = z.object({
  quizId: z.string().uuid(),
  feedback: z.string().nullable(),
});

export const GET = withSessionAuth(
  async (
    _request,
    context,
    params:
      | { wsId: string; courseId: string; testId: string; attemptId: string }
      | Promise<{ wsId: string; courseId: string; testId: string; attemptId: string }>
  ) => {
    try {
      const parsedParams = RouteParamsSchema.safeParse(await params);
      if (!parsedParams.success) {
        return NextResponse.json(
          { message: 'Invalid route params', errors: parsedParams.error.issues },
          { status: 400 }
        );
      }

      const { wsId, courseId, testId, attemptId } = parsedParams.data;

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

      // Verify test belongs to course
      const { data: test, error: testErr } = await access.sbAdmin
        .from('course_tests')
        .select('id')
        .eq('id', testId)
        .eq('course_id', courseId)
        .maybeSingle();

      if (testErr || !test) {
        return NextResponse.json({ message: 'Test not found' }, { status: 404 });
      }

      // Fetch attempt details
      const { data: attempt, error: attemptErr } = await access.sbAdmin
        .from('course_test_attempts')
        .select('*')
        .eq('id', attemptId)
        .eq('test_id', testId)
        .maybeSingle();

      if (attemptErr || !attempt) {
        return NextResponse.json({ message: 'Attempt not found' }, { status: 404 });
      }

      // Fetch user profile info
      const { data: student } = await access.sbAdmin
        .from('users')
        .select('id, display_name, email, avatar_url')
        .eq('id', attempt.user_id)
        .maybeSingle();

      // Fetch quizzes linked to this test
      const { data: testQuizzes, error: tqErr } = await access.sbAdmin
        .from('course_test_quizzes')
        .select('quiz_id')
        .eq('test_id', testId);

      if (tqErr) throw tqErr;

      const quizIds = (testQuizzes ?? []).map((tq) => tq.quiz_id);

      let quizzes: any[] = [];
      if (quizIds.length > 0) {
        const { data: rawQuizzes, error: quizzesErr } = await access.sbAdmin
          .from('workspace_quizzes')
          .select(
            'id, question, type, content, score, quiz_options(id, value, is_correct, explanation)'
          )
          .in('id', quizIds)
          .order('created_at', { ascending: false });

        if (quizzesErr) throw quizzesErr;
        quizzes = rawQuizzes ?? [];
      }

      // Fetch student's answers (including feedback)
      const { data: answers, error: answersErr } = await access.sbAdmin
        .from('course_test_attempt_answers')
        .select('quiz_id, selected_option_id, answer, is_correct, score_awarded, feedback')
        .eq('attempt_id', attemptId);

      if (answersErr) throw answersErr;

      return NextResponse.json({
        attempt,
        student,
        quizzes,
        answers: answers ?? [],
      });
    } catch (error) {
      serverLogger.error('Failed to get test submission details:', error);
      return NextResponse.json(
        { message: 'Failed to load submission details' },
        { status: 500 }
      );
    }
  },
  {
    rateLimit: { windowMs: 60000, maxRequests: 120 },
    allowAppSessionAuth: { targetApp: 'teach' },
  }
);

export const PATCH = withSessionAuth(
  async (
    request,
    context,
    params:
      | { wsId: string; courseId: string; testId: string; attemptId: string }
      | Promise<{ wsId: string; courseId: string; testId: string; attemptId: string }>
  ) => {
    try {
      const parsedParams = RouteParamsSchema.safeParse(await params);
      if (!parsedParams.success) {
        return NextResponse.json(
          { message: 'Invalid route params', errors: parsedParams.error.issues },
          { status: 400 }
        );
      }

      const { wsId, courseId, testId, attemptId } = parsedParams.data;

      const access = await requireTeachWorkspaceAccess({
        context,
        permission: 'view_user_groups',
        wsId,
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

      const parsedBody = UpdateFeedbackSchema.safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json(
          { message: 'Invalid request body', errors: parsedBody.error.issues },
          { status: 400 }
        );
      }

      const { quizId, feedback } = parsedBody.data;

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

      // Verify test belongs to course
      const { data: test, error: testErr } = await access.sbAdmin
        .from('course_tests')
        .select('id')
        .eq('id', testId)
        .eq('course_id', courseId)
        .maybeSingle();

      if (testErr || !test) {
        return NextResponse.json({ message: 'Test not found' }, { status: 404 });
      }

      // Update answer feedback
      const { data: updated, error: updateErr } = await access.sbAdmin
        .from('course_test_attempt_answers')
        .update({ feedback })
        .eq('attempt_id', attemptId)
        .eq('quiz_id', quizId)
        .select('quiz_id, selected_option_id, answer, is_correct, score_awarded, feedback')
        .single();

      if (updateErr) {
        serverLogger.error('Failed to update submission feedback:', {
          error: updateErr,
          attemptId,
          quizId,
        });
        return NextResponse.json(
          { message: 'Failed to save feedback' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, answer: updated });
    } catch (error) {
      serverLogger.error('Failed to patch test submission feedback:', error);
      return NextResponse.json(
        { message: 'Failed to update feedback' },
        { status: 500 }
      );
    }
  },
  {
    rateLimit: { windowMs: 60000, maxRequests: 120 },
    allowAppSessionAuth: { targetApp: 'teach' },
  }
);
