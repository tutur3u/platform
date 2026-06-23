import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@/lib/tulearn/service';

type Params = {
  courseId: string;
  testId: string;
  wsId: string;
};

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

      const sbAdmin = await createAdminClient();

      // Verify course and test exist and are published
      const { data: test, error: testErr } = await sbAdmin
        .from('course_tests')
        .select('id, name, start_at, is_published, course_id')
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

      // Check if current time is before test.start_at
      if (test.start_at && new Date(test.start_at).getTime() > Date.now()) {
        return NextResponse.json(
          { message: 'This test has not started yet' },
          { status: 400 }
        );
      }

      // Create a single attempt per test/student. Concurrent starts race on the
      // unique constraint and then re-read the winning attempt.
      const { error: createErr } = await sbAdmin
        .from('course_test_attempts')
        .upsert(
          {
            test_id: testId,
            user_id: subject.studentPlatformUserId,
            started_at: new Date().toISOString(),
          },
          {
            ignoreDuplicates: true,
            onConflict: 'test_id,user_id',
          }
        );

      if (createErr) throw createErr;

      const { data: attempt, error: attemptErr } = await sbAdmin
        .from('course_test_attempts')
        .select('*')
        .eq('test_id', testId)
        .eq('user_id', subject.studentPlatformUserId)
        .single();

      if (attemptErr) throw attemptErr;

      if (attempt.submitted_at) {
        return NextResponse.json(
          { message: 'You have already submitted this test' },
          { status: 400 }
        );
      }

      return NextResponse.json(attempt);
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      serverLogger.error('Failed to start test attempt:', error);
      return NextResponse.json(
        { message: 'Failed to start test attempt' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
