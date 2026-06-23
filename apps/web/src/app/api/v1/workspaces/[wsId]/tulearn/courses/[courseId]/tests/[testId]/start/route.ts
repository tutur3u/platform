import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveTulearnSubject, tulearnAccessErrorResponse } from '@/lib/tulearn/service';
import { serverLogger } from '@/lib/infrastructure/log-drain';

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
        return NextResponse.json({ message: 'Test not found' }, { status: 404 });
      }

      // Check if current time is before test.start_at
      if (test.start_at && new Date(test.start_at).getTime() > Date.now()) {
        return NextResponse.json(
          { message: 'This test has not started yet' },
          { status: 400 }
        );
      }

      // Check if attempt already exists
      const { data: existingAttempt, error: attemptErr } = await sbAdmin
        .from('course_test_attempts')
        .select('*')
        .eq('test_id', testId)
        .eq('user_id', subject.studentPlatformUserId)
        .maybeSingle();

      if (attemptErr) throw attemptErr;

      if (existingAttempt) {
        if (existingAttempt.submitted_at) {
          return NextResponse.json(
            { message: 'You have already submitted this test' },
            { status: 400 }
          );
        }
        return NextResponse.json(existingAttempt);
      }

      // Create new attempt session
      const { data: newAttempt, error: createErr } = await sbAdmin
        .from('course_test_attempts')
        .insert({
          test_id: testId,
          user_id: subject.studentPlatformUserId,
          started_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (createErr) throw createErr;

      return NextResponse.json(newAttempt);
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
