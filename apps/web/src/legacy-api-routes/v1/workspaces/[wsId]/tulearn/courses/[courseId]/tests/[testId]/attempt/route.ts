import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@/lib/tulearn/service';
import {
  isAttemptExpired,
  submitTestAttemptInternal,
} from '@/lib/tulearn/test-session';

type Params = {
  courseId: string;
  testId: string;
  wsId: string;
};

type ReviewQuiz = {
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

type ReviewAnswer = {
  answer: unknown;
  feedback: string | null;
  is_correct: boolean | null;
  quiz_id: string;
  score_awarded: number | null;
  selected_option_id: string | null;
};

type ActiveQuiz = Omit<ReviewQuiz, 'quiz_options'> & {
  quiz_options: {
    id: string;
    value: string | null;
  }[];
};

type ActiveAnswer = {
  answer: unknown;
  quiz_id: string;
  selected_option_id: string | null;
};

export const GET = withSessionAuth<Params>(
  async (request, { supabase, user }, { courseId, testId, wsId }) => {
    try {
      const subject = await resolveTulearnSubject({
        requestSupabase: supabase,
        studentId: request.nextUrl.searchParams.get('studentId'),
        user,
        wsId,
      });

      const sbAdmin = await createAdminClient();

      // Verify course and test exist and are published
      const { data: test, error: testErr } = await sbAdmin
        .from('course_tests')
        .select(
          'id, name, duration_in_minutes, start_at, is_published, is_score_published, course_id'
        )
        .eq('id', testId)
        .eq('course_id', courseId)
        .eq('is_published', true)
        .maybeSingle();

      if (testErr || !test) {
        return NextResponse.json(
          { message: 'Test not found' },
          { status: 404 }
        );
      }

      // Fetch student's attempt
      let { data: attempt, error: attemptErr } = await sbAdmin
        .from('course_test_attempts')
        .select('*')
        .eq('test_id', testId)
        .eq('user_id', subject.studentPlatformUserId)
        .maybeSingle();

      if (attemptErr) throw attemptErr;

      // Handle auto-submit if expired. Read-only callers can inspect state but
      // must not trigger writes through this GET endpoint.
      if (
        attempt &&
        !attempt.submitted_at &&
        !subject.readOnly &&
        isAttemptExpired(attempt, test.duration_in_minutes)
      ) {
        attempt = await submitTestAttemptInternal(
          sbAdmin,
          attempt.id,
          testId,
          subject.studentPlatformUserId
        );
      }

      if (!attempt) {
        return NextResponse.json({ attempt: null });
      }

      const loadLinkedQuizzes = async <TQuiz extends ActiveQuiz | ReviewQuiz>(
        select: string
      ) => {
        const { data: testQuizzes, error: tqErr } = await sbAdmin
          .from('course_test_quizzes')
          .select('quiz_id')
          .eq('test_id', testId);

        if (tqErr) throw tqErr;

        const quizIds = (testQuizzes ?? []).map((tq) => tq.quiz_id);
        if (quizIds.length === 0) return [];

        const { data: rawQuizzes, error: quizzesErr } = await sbAdmin
          .from('workspace_quizzes')
          .select(select)
          .in('id', quizIds)
          .order('created_at', { ascending: false });

        if (quizzesErr) throw quizzesErr;
        return (rawQuizzes ?? []) as unknown as TQuiz[];
      };

      // If submitted, return the final result
      if (attempt.submitted_at) {
        const score = test.is_score_published ? attempt.score : null;

        let quizzes: ReviewQuiz[] = [];
        let answers: ReviewAnswer[] = [];

        // If score is published, we can also return quizzes (with is_correct/explanation) and answers so they can review their submission!
        if (test.is_score_published) {
          quizzes = await loadLinkedQuizzes<ReviewQuiz>(
            'id, question, type, content, score, quiz_options(id, value, is_correct, explanation)'
          );

          const { data: rawAnswers, error: answersErr } = await sbAdmin
            .from('course_test_attempt_answers')
            .select(
              'quiz_id, selected_option_id, answer, is_correct, score_awarded, feedback'
            )
            .eq('attempt_id', attempt.id);

          if (answersErr) throw answersErr;
          answers = (rawAnswers ?? []) as ReviewAnswer[];
        }

        return NextResponse.json({
          attempt: {
            ...attempt,
            score,
          },
          quizzes,
          answers,
        });
      }

      // Otherwise, return active attempt, stripped quizzes (no correct indicators), and saved answers
      const quizzes = await loadLinkedQuizzes<ActiveQuiz>(
        'id, question, type, content, score, quiz_options(id, value)'
      );

      // Get student's current answers
      const { data: answers, error: answersErr } = await sbAdmin
        .from('course_test_attempt_answers')
        .select('quiz_id, selected_option_id, answer') // Omit is_correct and score_awarded!
        .eq('attempt_id', attempt.id);

      if (answersErr) throw answersErr;

      return NextResponse.json({
        attempt,
        quizzes,
        answers: (answers ?? []) as ActiveAnswer[],
      });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      serverLogger.error('Failed to get test attempt:', error);
      return NextResponse.json(
        { message: 'Failed to load test attempt' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
