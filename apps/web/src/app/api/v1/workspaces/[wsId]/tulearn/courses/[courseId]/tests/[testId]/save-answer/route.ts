import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@/lib/tulearn/service';
import { submitTestAttemptInternal } from '@/lib/tulearn/test-session';

type Params = {
  courseId: string;
  testId: string;
  wsId: string;
};

const SaveAnswerPayloadSchema = z.object({
  attemptId: z.string().uuid(),
  quizId: z.string().uuid(),
  selectedOptionId: z.string().uuid().nullable().optional(),
  answer: z.unknown().optional(),
});

export const POST = withSessionAuth<Params>(
  async (request, { supabase, user }, { courseId, testId, wsId }) => {
    try {
      const subject = await resolveTulearnSubject({
        requestSupabase: supabase,
        studentId: request.nextUrl.searchParams.get('studentId'),
        user,
        wsId,
      });

      if (subject.readOnly) {
        return NextResponse.json(
          { message: 'Guest/Parent accounts are read-only' },
          { status: 403 }
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

      const parsedBody = SaveAnswerPayloadSchema.safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json(
          { message: 'Invalid request body', errors: parsedBody.error.issues },
          { status: 400 }
        );
      }

      const { attemptId, quizId, selectedOptionId, answer } = parsedBody.data;

      const sbAdmin = await createAdminClient();

      // Fetch test details
      const { data: test, error: testErr } = await sbAdmin
        .from('course_tests')
        .select('id, name, duration_in_minutes, is_published, course_id')
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

      // Fetch attempt session
      const { data: attempt, error: attemptErr } = await sbAdmin
        .from('course_test_attempts')
        .select('*')
        .eq('id', attemptId)
        .eq('user_id', subject.studentPlatformUserId)
        .eq('test_id', testId)
        .maybeSingle();

      if (attemptErr || !attempt) {
        return NextResponse.json(
          { message: 'Attempt not found' },
          { status: 404 }
        );
      }

      if (attempt.submitted_at) {
        return NextResponse.json(
          { message: 'This test attempt has already been submitted' },
          { status: 400 }
        );
      }

      // Check duration limit with 1-minute grace period
      if (test.duration_in_minutes) {
        const startedTime = new Date(attempt.started_at).getTime();
        const durationMs = test.duration_in_minutes * 60 * 1000;
        const graceMs = 60 * 1000;
        if (startedTime + durationMs + graceMs < Date.now()) {
          // Auto-submit and reject response save
          await submitTestAttemptInternal(
            sbAdmin,
            attempt.id,
            testId,
            subject.studentPlatformUserId
          );
          return NextResponse.json(
            { message: 'Time limit reached, test has been submitted' },
            { status: 400 }
          );
        }
      }

      // Verify quiz belongs to this test
      const { data: testQuiz, error: tqErr } = await sbAdmin
        .from('course_test_quizzes')
        .select('quiz_id')
        .eq('test_id', testId)
        .eq('quiz_id', quizId)
        .maybeSingle();

      if (tqErr || !testQuiz) {
        return NextResponse.json(
          { message: 'Quiz does not belong to this test' },
          { status: 400 }
        );
      }

      // Upsert answer
      const { error: upsertErr } = await sbAdmin
        .from('course_test_attempt_answers')
        .upsert(
          {
            attempt_id: attemptId,
            quiz_id: quizId,
            selected_option_id: selectedOptionId ?? null,
            answer: answer !== undefined ? (answer as any) : null,
            is_correct: null, // Keep secret until submission
            score_awarded: null,
          },
          { onConflict: 'attempt_id,quiz_id' }
        );

      if (upsertErr) throw upsertErr;

      return NextResponse.json({ success: true });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      serverLogger.error('Failed to save test answer:', error);
      return NextResponse.json(
        { message: 'Failed to save answer' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
