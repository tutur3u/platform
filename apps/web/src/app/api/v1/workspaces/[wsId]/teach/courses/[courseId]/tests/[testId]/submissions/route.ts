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
});

export const GET = withSessionAuth(
  async (
    _request,
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

    // Fetch all attempts for this test
    const { data: attempts, error: attemptsErr } = await access.sbAdmin
      .from('course_test_attempts')
      .select('id, user_id, started_at, submitted_at, score, created_at')
      .eq('test_id', testId)
      .order('submitted_at', { ascending: false, nullsFirst: false });

    if (attemptsErr) {
      serverLogger.error('Failed to fetch test submissions', {
        error: attemptsErr,
        testId,
        wsId: access.normalizedWsId,
      });
      return NextResponse.json(
        { message: 'Error fetching submissions' },
        { status: 500 }
      );
    }

    if (!attempts || attempts.length === 0) {
      return NextResponse.json({ data: [], count: 0 });
    }

    // Fetch user display names
    const userIds = [...new Set(attempts.map((a) => a.user_id))];
    const { data: users } = await access.sbAdmin
      .from('users')
      .select('id, display_name')
      .in('id', userIds);

    const userMap = new Map(
      (users ?? []).map((u) => [u.id, u.display_name ?? 'Unknown'])
    );

    // Count total quizzes for this test
    const { count: totalQuizzes } = await access.sbAdmin
      .from('course_test_quizzes')
      .select('quiz_id', { count: 'exact', head: true })
      .eq('test_id', testId);

    // Fetch answer counts per attempt
    const attemptIds = attempts.map((a) => a.id);
    const { data: answerCounts } = await access.sbAdmin
      .from('course_test_attempt_answers')
      .select('attempt_id, is_correct')
      .in('attempt_id', attemptIds);

    const answerCountMap = new Map<
      string,
      { answered: number; correct: number }
    >();
    for (const ans of answerCounts ?? []) {
      const entry = answerCountMap.get(ans.attempt_id) ?? {
        answered: 0,
        correct: 0,
      };
      entry.answered++;
      if (ans.is_correct === true) entry.correct++;
      answerCountMap.set(ans.attempt_id, entry);
    }

    const data = attempts.map((a) => ({
      id: a.id,
      userId: a.user_id,
      userName: userMap.get(a.user_id) ?? 'Unknown',
      startedAt: a.started_at,
      submittedAt: a.submitted_at,
      score: a.score,
      answeredCount: answerCountMap.get(a.id)?.answered ?? 0,
      correctCount: answerCountMap.get(a.id)?.correct ?? 0,
      totalQuizzes: totalQuizzes ?? 0,
    }));

    return NextResponse.json({ data, count: data.length });
  },
  {
    rateLimit: { windowMs: 60000, maxRequests: 120 },
    allowAppSessionAuth: { targetApp: 'teach' },
  }
);
