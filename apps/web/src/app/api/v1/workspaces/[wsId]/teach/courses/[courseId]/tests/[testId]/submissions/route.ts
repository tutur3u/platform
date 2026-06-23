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

type CountAggregateRow = {
  attempt_id: string;
  count?: number | string | null;
};

type QuizScoreRow = {
  id: string;
  score: number | null;
};

function parseAggregateCount(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

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

    const { data: testQuizzes, error: testQuizzesErr } = await access.sbAdmin
      .from('course_test_quizzes')
      .select('quiz_id')
      .eq('test_id', testId);
    if (testQuizzesErr) {
      serverLogger.error('Failed to fetch test quizzes for submissions', {
        error: testQuizzesErr,
        testId,
        wsId: access.normalizedWsId,
      });
      return NextResponse.json(
        { message: 'Error fetching submission quizzes' },
        { status: 500 }
      );
    }

    const quizIds = (testQuizzes ?? []).map((quiz) => quiz.quiz_id);
    const totalQuizzes = quizIds.length;
    let maxScore = 0;
    if (quizIds.length > 0) {
      const { data: quizScores, error: quizScoresErr } = await access.sbAdmin
        .from('workspace_quizzes')
        .select('id, score')
        .in('id', quizIds);
      if (quizScoresErr) {
        serverLogger.error('Failed to fetch test quiz scores', {
          error: quizScoresErr,
          testId,
          wsId: access.normalizedWsId,
        });
        return NextResponse.json(
          { message: 'Error fetching submission quiz scores' },
          { status: 500 }
        );
      }

      maxScore = ((quizScores ?? []) as QuizScoreRow[]).reduce(
        (sum, quiz) => sum + (quiz.score ?? 0),
        0
      );
    }

    // Fetch answer counts per attempt using grouped aggregates in PostgREST.
    const attemptIds = attempts.map((a) => a.id);
    const [
      { data: answeredCounts, error: answeredCountsErr },
      { data: correctCounts, error: correctCountsErr },
    ] = await Promise.all([
      access.sbAdmin
        .from('course_test_attempt_answers')
        .select('attempt_id, count()')
        .in('attempt_id', attemptIds),
      access.sbAdmin
        .from('course_test_attempt_answers')
        .select('attempt_id, count()')
        .in('attempt_id', attemptIds)
        .eq('is_correct', true),
    ]);
    if (answeredCountsErr || correctCountsErr) {
      serverLogger.error('Failed to fetch test submission answer counts', {
        attemptIds,
        error: answeredCountsErr ?? correctCountsErr,
        testId,
        wsId: access.normalizedWsId,
      });
      return NextResponse.json(
        { message: 'Error fetching submission answer counts' },
        { status: 500 }
      );
    }

    const answerCountMap = new Map<
      string,
      { answered: number; correct: number }
    >();
    for (const row of (answeredCounts ?? []) as CountAggregateRow[]) {
      const entry = answerCountMap.get(row.attempt_id) ?? {
        answered: 0,
        correct: 0,
      };
      entry.answered = parseAggregateCount(row.count);
      answerCountMap.set(row.attempt_id, entry);
    }
    for (const row of (correctCounts ?? []) as CountAggregateRow[]) {
      const entry = answerCountMap.get(row.attempt_id) ?? {
        answered: 0,
        correct: 0,
      };
      entry.correct = parseAggregateCount(row.count);
      answerCountMap.set(row.attempt_id, entry);
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
      maxScore,
      totalQuizzes,
    }));

    return NextResponse.json({ data, count: data.length });
  },
  {
    rateLimit: { windowMs: 60000, maxRequests: 120 },
    allowAppSessionAuth: { targetApp: 'teach' },
  }
);
