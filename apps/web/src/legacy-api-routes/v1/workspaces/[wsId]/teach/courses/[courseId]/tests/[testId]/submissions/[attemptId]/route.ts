import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
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
  isCorrect: z.boolean().nullable().optional(),
  scoreAwarded: z.number().min(0).nullable().optional(),
});

type SubmissionQuiz = {
  content: unknown;
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

type AnswerScoreRow = {
  score_awarded: number | null;
};

export const GET = withSessionAuth(
  async (
    _request,
    context,
    params:
      | { wsId: string; courseId: string; testId: string; attemptId: string }
      | Promise<{
          wsId: string;
          courseId: string;
          testId: string;
          attemptId: string;
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
        return NextResponse.json(
          { message: 'Test not found' },
          { status: 404 }
        );
      }

      // Fetch attempt details
      const { data: attempt, error: attemptErr } = await access.sbAdmin
        .from('course_test_attempts')
        .select('*')
        .eq('id', attemptId)
        .eq('test_id', testId)
        .maybeSingle();

      if (attemptErr || !attempt) {
        return NextResponse.json(
          { message: 'Attempt not found' },
          { status: 404 }
        );
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

      let quizzes: SubmissionQuiz[] = [];
      if (quizIds.length > 0) {
        const { data: rawQuizzes, error: quizzesErr } = await access.sbAdmin
          .from('workspace_quizzes')
          .select(
            'id, question, type, content, score, quiz_options(id, value, is_correct, explanation)'
          )
          .in('id', quizIds)
          .order('created_at', { ascending: false });

        if (quizzesErr) throw quizzesErr;
        quizzes = (rawQuizzes ?? []) as SubmissionQuiz[];
      }

      // Fetch student's answers (including feedback)
      const { data: answers, error: answersErr } = await access.sbAdmin
        .from('course_test_attempt_answers')
        .select(
          'quiz_id, selected_option_id, answer, is_correct, score_awarded, feedback'
        )
        .eq('attempt_id', attemptId);

      if (answersErr) throw answersErr;

      return NextResponse.json({
        attempt,
        student,
        quizzes,
        answers: answers ?? [],
      });
    } catch (error) {
      console.error('Failed to get test submission details:', error);
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
      | Promise<{
          wsId: string;
          courseId: string;
          testId: string;
          attemptId: string;
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

      const { wsId, courseId, testId, attemptId } = parsedParams.data;

      const access = await requireTeachWorkspaceAccess({
        context,
        permission: 'update_user_groups',
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

      const { feedback, isCorrect, quizId, scoreAwarded } = parsedBody.data;

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
        return NextResponse.json(
          { message: 'Test not found' },
          { status: 404 }
        );
      }

      const { data: scopedAttempt, error: scopedAttemptErr } =
        await access.sbAdmin
          .from('course_test_attempts')
          .select('id')
          .eq('id', attemptId)
          .eq('test_id', testId)
          .maybeSingle();
      if (scopedAttemptErr) throw scopedAttemptErr;
      if (!scopedAttempt) {
        return NextResponse.json(
          { message: 'Attempt not found' },
          { status: 404 }
        );
      }

      const { data: scopedQuiz, error: scopedQuizErr } = await access.sbAdmin
        .from('course_test_quizzes')
        .select('quiz_id')
        .eq('test_id', testId)
        .eq('quiz_id', quizId)
        .maybeSingle();
      if (scopedQuizErr) throw scopedQuizErr;
      if (!scopedQuiz) {
        return NextResponse.json(
          { message: 'Quiz not found for test' },
          { status: 404 }
        );
      }

      const { data: quiz, error: quizErr } = await access.sbAdmin
        .from('workspace_quizzes')
        .select('id, score')
        .eq('id', quizId)
        .maybeSingle();
      if (quizErr) throw quizErr;
      if (!quiz) {
        return NextResponse.json(
          { message: 'Quiz not found' },
          { status: 404 }
        );
      }

      const maxScore = quiz.score;
      if (scoreAwarded != null && maxScore != null && scoreAwarded > maxScore) {
        return NextResponse.json(
          { message: 'Score cannot exceed the question maximum' },
          { status: 400 }
        );
      }

      const answerUpdate: {
        feedback: string | null;
        is_correct?: boolean | null;
        score_awarded?: number | null;
      } = { feedback };
      if (scoreAwarded !== undefined) {
        answerUpdate.score_awarded = scoreAwarded;
        answerUpdate.is_correct =
          isCorrect ?? (scoreAwarded !== null ? scoreAwarded > 0 : null);
      }

      // Update answer feedback
      const { data: updated, error: updateErr } = await access.sbAdmin
        .from('course_test_attempt_answers')
        .update(answerUpdate)
        .eq('attempt_id', attemptId)
        .eq('quiz_id', quizId)
        .select(
          'quiz_id, selected_option_id, answer, is_correct, score_awarded, feedback'
        )
        .single();

      if (updateErr) {
        console.error('Failed to update submission feedback:', {
          error: updateErr,
          attemptId,
          quizId,
        });
        return NextResponse.json(
          { message: 'Failed to save feedback' },
          { status: 500 }
        );
      }

      if (scoreAwarded !== undefined) {
        const { data: scoreRows, error: scoreRowsErr } = await access.sbAdmin
          .from('course_test_attempt_answers')
          .select('score_awarded')
          .eq('attempt_id', attemptId);
        if (scoreRowsErr) throw scoreRowsErr;

        const totalScore = ((scoreRows ?? []) as AnswerScoreRow[]).reduce(
          (sum, answer) => sum + (answer.score_awarded ?? 0),
          0
        );

        const { error: attemptScoreErr } = await access.sbAdmin
          .from('course_test_attempts')
          .update({ score: totalScore })
          .eq('id', attemptId)
          .eq('test_id', testId);
        if (attemptScoreErr) throw attemptScoreErr;
      }

      return NextResponse.json({ success: true, answer: updated });
    } catch (error) {
      console.error('Failed to patch test submission feedback:', error);
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
