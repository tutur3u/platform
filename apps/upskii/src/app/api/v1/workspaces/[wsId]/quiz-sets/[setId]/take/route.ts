// File: app/api/quiz-sets/[setId]/take/route.ts
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

type RawRow = {
  quiz_id: string;
  workspace_quizzes: {
    question: string;
    score: number;
    quiz_options: { id: string; value: string }[];
  };
};

export async function GET(
  request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const { setId } = params;
  const supabase = await createClient();

  // 1) Auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = user.id;

  // 2) Fetch quiz-set metadata
  const { data: setRow, error: setErr } = await supabase
    .from('workspace_quiz_sets')
    .select(
      `
      id,
      name,
      attempt_limit,
      time_limit_minutes,
      due_date,
      release_points_immediately
    `
    )
    .eq('id', setId)
    .maybeSingle();

  if (setErr || !setRow) {
    return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
  }

  const {
    name: setName,
    attempt_limit,
    time_limit_minutes,
    due_date,
    release_points_immediately,
  } = setRow;

  // 3) due_date enforcement
  if (new Date(due_date) < new Date()) {
    return NextResponse.json(
      { error: 'Quiz is past its due date', dueDate: due_date },
      { status: 403 }
    );
  }

  // 4) Count previous attempts
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

  // 5) If limit reached, block
  if (attempt_limit !== null && attemptsCount >= attempt_limit) {
    return NextResponse.json(
      {
        error: 'Maximum attempts reached',
        attemptsSoFar: attemptsCount,
        attemptLimit: attempt_limit,
        dueDate: due_date,
        allowViewResults: false,
      },
      { status: 403 }
    );
  }

  // 6) If release is immediate AND they’ve already done ≥1 attempt, return past attempts directly
  if (release_points_immediately && attemptsCount > 0) {
    // Fetch and return their attempts (very basic summary; frontend can call /results for detail)
    return NextResponse.json({
      message: 'Results are viewable immediately',
      attemptsSoFar: attemptsCount,
      allowViewResults: true,
    });
  }

  // 7) Otherwise, return questions for taking
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
      { error: 'Error fetching questions' },
      { status: 500 }
    );
  }

  const questions = (rawData as RawRow[]).map((row) => ({
    quizId: row.quiz_id,
    question: row.workspace_quizzes.question,
    score: row.workspace_quizzes.score,
    options: row.workspace_quizzes.quiz_options.map((o) => ({
      id: o.id,
      value: o.value,
    })),
  }));

  return NextResponse.json({
    setId,
    setName,
    attemptLimit: attempt_limit,
    timeLimitMinutes: time_limit_minutes,
    attemptsSoFar: attemptsCount,
    dueDate: due_date,
    questions,
  });
}
