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

const SubmitPayloadSchema = z.object({
  attemptId: z.string().uuid(),
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

      const parsedBody = SubmitPayloadSchema.safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json(
          { message: 'Invalid request body', errors: parsedBody.error.issues },
          { status: 400 }
        );
      }

      const { attemptId } = parsedBody.data;

      const sbAdmin = await createAdminClient();

      // Fetch test details
      const { data: test, error: testErr } = await sbAdmin
        .from('course_tests')
        .select('id, name, is_published, course_id')
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

      // Grade the attempt (or return if already graded)
      const gradedAttempt = await submitTestAttemptInternal(
        sbAdmin,
        attemptId,
        testId,
        subject.studentPlatformUserId
      );

      return NextResponse.json({ success: true, attempt: gradedAttempt });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      serverLogger.error('Failed to submit test attempt:', error);
      return NextResponse.json(
        { message: 'Failed to submit test' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
