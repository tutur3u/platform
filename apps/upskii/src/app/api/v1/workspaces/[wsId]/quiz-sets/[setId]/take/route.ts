// File: app/api/quiz-sets/[setId]/take/route.ts
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

type RawRow = {
  quiz_id: string;
  workspace_quizzes: {
    question: string;
    score: number;
    instruction: any; // JSONB
    quiz_options: { id: string; value: string; is_correct: boolean }[];
  };
};

type AttemptSummary = {
  attemptId: string;
  attemptNumber: number;
  submittedAt: string; // ISO timestamp
  durationSeconds: number;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { setId: string } }
) {
  const setId = params.setId;
  const sb = await createClient();

  // 1) Auth
  const {
    data: { user },
    error: uErr,
  } = await sb.auth.getUser();
  if (uErr || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = user.id;

  // 2) Fetch quiz-set metadata (+ new cols)
  const { data: setRow, error: sErr } = await sb
    .from('workspace_quiz_sets')
    .select(
      `
      id,
      name,
      attempt_limit,
      time_limit_minutes,
      available_date,
      due_date,
      allow_view_old_attempts,
      results_released,
      explanation_mode,
      instruction
    `
    )
    .eq('id', setId)
    .maybeSingle();
  if (sErr || !setRow) {
    return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
  }
  const {
    name: setName,
    attempt_limit: attemptLimit,
    time_limit_minutes: timeLimitMinutes,
    available_date: availableDate,
    due_date: dueDate,
    allow_view_old_attempts: allowViewOldAttempts,
    results_released: resultsReleased,
    explanation_mode: explanationMode,
    instruction,
  } = setRow;

  const now = new Date();

  // 3) Availability & due checks
  if (availableDate && new Date(availableDate) > now) {
    return NextResponse.json(
      { error: 'Quiz not yet available', availableDate },
      { status: 403 }
    );
  }
  if (dueDate && new Date(dueDate) < now) {
    return NextResponse.json(
      { error: 'Quiz past due', dueDate },
      { status: 403 }
    );
  }

  // 4) Count how many attempts user already made
  const { data: prev, error: aErr } = await sb
    .from('workspace_quiz_attempts')
    .select('attempt_number', { count: 'exact', head: false })
    .eq('user_id', userId)
    .eq('set_id', setId);
  if (aErr) {
    return NextResponse.json(
      { error: 'Error counting attempts' },
      { status: 500 }
    );
  }
  const attemptsSoFar = prev?.length ?? 0;

  // 5) Enforce attempt limit
  if (attemptLimit !== null && attemptsSoFar >= attemptLimit) {
    return NextResponse.json(
      {
        error: 'Max attempts reached',
        attemptsSoFar,
        attemptLimit,
        allowViewResults: false,
      },
      { status: 403 }
    );
  }

  // 7) Fetch all previous attempts summary
  const { data: rawAttempts, error: attErr } = await sb
    .from('workspace_quiz_attempts')
    .select('id,attempt_number,started_at,completed_at')
    .eq('user_id', userId)
    .eq('set_id', setId)
    .order('attempt_number', { ascending: false });
  if (attErr) {
    return NextResponse.json(
      { error: 'Error fetching attempts' },
      { status: 500 }
    );
  }
  const attempts: AttemptSummary[] = (rawAttempts || []).map((row) => {
    const started = new Date(row.started_at).getTime();
    const completed = row.completed_at
      ? new Date(row.completed_at).getTime()
      : Date.now();
    const durationSeconds = Math.floor((completed - started) / 1000);
    return {
      attemptId: row.id,
      attemptNumber: row.attempt_number,
      submittedAt: row.completed_at ?? row.started_at,
      durationSeconds,
    };
  });

  // 8) Early‐exit if they’ve already done one attempt _and_ results are viewable
  // if (allowViewResults && attemptsSoFar > 0) {
  //   return NextResponse.json({
  //     setId,
  //     setName,
  //     timeLimitMinutes,
  //     releasePointsImmediately,
  //     resultsReleased,
  //     attemptLimit,
  //     attemptsSoFar,
  //     allowViewResults,
  //     availableDate,
  //     dueDate,
  //     attempts,
  //     explanationMode,
  //     instruction,
  //     questions: [], // no need to send questions
  //   });
  // }

  // 9) Otherwise fetch questions+options as before
  const { data: rawQ, error: qErr } = await sb
    .from('quiz_set_quizzes')
    .select(
      `
      quiz_id,
      workspace_quizzes (
        question,
        score,
        instruction,
        quiz_options (
          id,
          value,
          is_correct
        )
      )
    `
    )
    .eq('set_id', setId);
  if (qErr) {
    return NextResponse.json(
      { error: 'Error fetching questions' },
      { status: 500 }
    );
  }
  const questions = (rawQ as RawRow[]).map((r) => ({
    quizId: r.quiz_id,
    question: r.workspace_quizzes.question,
    score: r.workspace_quizzes.score,
    multiple:
      r.workspace_quizzes.quiz_options.filter((o) => o.is_correct).length > 1,
    options: r.workspace_quizzes.quiz_options.map((o) => ({
      id: o.id,
      value: o.value,
    })),
    instruction: r.workspace_quizzes.instruction ?? instruction,
  }));

  // 10) Return the full TakeResponse
  return NextResponse.json({
    setId,
    setName,
    timeLimitMinutes,
    allowViewOldAttempts,
    attemptLimit,
    attemptsSoFar,
    resultsReleased,
    // allowViewResults,
    availableDate,
    dueDate,
    attempts,
    explanationMode,
    instruction,
    questions,
  });
}
