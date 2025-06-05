// File: app/api/quiz-sets/[setId]/take/route.ts
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

type RawRow = {
  quiz_id: string;
  workspace_quizzes: {
    question: string;
    score: number;
    quiz_options: Array<{
      id: string;
      value: string;
    }>;
  };
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const setId = params.setId;
  const supabase = await createClient();

  // 1) Authenticate
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = user.id;

  // 2) Fetch quiz set metadata, including the new “release” fields
  const { data: setRow, error: setErr } = await supabase
    .from('workspace_quiz_sets')
    .select(
      'id, name, time_limit_minutes, attempt_limit, release_points_immediately, release_at'
    )
    .eq('id', setId)
    .maybeSingle();

  if (setErr || !setRow) {
    return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
  }

  const {
    name: setName,
    time_limit_minutes,
    attempt_limit,
    release_points_immediately,
    release_at,
  } = setRow;

  // 3) Count how many attempts this user already has
  const { data: prevAttempts, error: attErr } = await supabase
    .from('workspace_quiz_attempts')
    .select('attempt_number', { count: 'exact', head: false })
    .eq('user_id', userId)
    .eq('set_id', setId);

  if (attErr) {
    return NextResponse.json(
      { error: 'Error counting attempts' },
      { status: 500 }
    );
  }
  const attemptsCount = prevAttempts?.length ?? 0;

  // 4) If attempt_limit is set and they’ve used them all, return 403
  if (
    attempt_limit !== null &&
    attempt_limit !== undefined &&
    attemptsCount >= attempt_limit
  ) {
    return NextResponse.json(
      {
        error: 'Maximum attempts reached',
        attemptsSoFar: attemptsCount,
        attemptLimit: attempt_limit,
        allowViewResults: false, // if they maxed out before, still no results until release time
      },
      { status: 403 }
    );
  }

  // 5) Compute allowViewResults:
  //    True if either release_points_immediately = true, OR (release_at <= now).
  let allowViewResults = false;
  if (release_points_immediately) {
    allowViewResults = true;
  } else if (release_at) {
    const now = new Date();
    const releaseDate = new Date(release_at);
    if (releaseDate <= now) {
      allowViewResults = true;
    }
  }

  // 6) Fetch all questions + nested options + score
  const { data: rawData, error: quizErr } = await supabase
    .from('quiz_set_quizzes')
    .select(
      `
      quiz_id,
      workspace_quizzes (
        question,
        score,
        quiz_options (
          id,
          value
        )
      )
    `
    )
    .eq('set_id', setId);

  if (quizErr) {
    return NextResponse.json(
      { error: 'Error fetching quiz questions' },
      { status: 500 }
    );
  }

  const quizRows = (rawData as unknown as RawRow[]) ?? [];
  const questions = quizRows.map((row) => ({
    quizId: row.quiz_id,
    question: row.workspace_quizzes.question,
    score: row.workspace_quizzes.score,
    options: row.workspace_quizzes.quiz_options.map((opt) => ({
      id: opt.id,
      value: opt.value,
    })),
  }));

  // 7) Return everything
  return NextResponse.json({
    setId,
    setName,
    timeLimitMinutes: time_limit_minutes,
    attemptLimit: attempt_limit,
    attemptsSoFar: attemptsCount,
    allowViewResults,
    questions,
  });
}
