import { createClient } from '@tuturuuu/supabase/next/server';
import { Json } from '@tuturuuu/types/supabase';
import { NextRequest, NextResponse } from 'next/server';

export type AttemptSummary = {
  attemptId: string;
  attemptNumber: number;
  submittedAt: string;
  totalScore: number | null;
  durationSeconds: number;
};

export interface TakeResponse {
  setId: string;
  setName: string;
  timeLimitMinutes: number | null;
  attemptLimit: number | null;
  attemptsSoFar: number;
  allowViewOldAttempts: boolean;
  availableDate: string | null;
  dueDate: string | null;
  resultsReleased: boolean;
  explanationMode: 0 | 1 | 2;
  instruction: any;
  attempts: AttemptSummary[];
  maxScore: number;
  questions: Array<{
    quizId: string;
    question: string;
    instruction: Json;
    score: number;
    multiple: boolean;
    options: { id: string; value: string }[];
  }>;
  isAvailable: boolean;
  isPastDue: boolean;
  hasReachedMax: boolean;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { setId: string } }
) {
  const { setId } = params;
  const sb = await createClient();

  // 1) Auth
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = user.id;

  // 2) Fetch metadata
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

  // 3) Count attempts
  const { data: prev, error: aErr } = await sb
    .from('workspace_quiz_attempts')
    .select('attempt_number', { head: false })
    .eq('user_id', userId)
    .eq('set_id', setId);
  if (aErr) {
    return NextResponse.json(
      { error: 'Error counting attempts' },
      { status: 500 }
    );
  }
  const attemptsSoFar = prev?.length ?? 0;

  // 4) Summaries
  const { data: rawAttempts, error: attErr } = await sb
    .from('workspace_quiz_attempts')
    .select('id,attempt_number,started_at,completed_at,total_score')
    .eq('user_id', userId)
    .eq('set_id', setId)
    .order('attempt_number', { ascending: false });
  if (attErr) {
    return NextResponse.json(
      { error: 'Error fetching attempts' },
      { status: 500 }
    );
  }
  const attempts = (rawAttempts || []).map((row) => {
    const startMs = new Date(row.started_at).getTime();
    const endMs = row.completed_at
      ? new Date(row.completed_at).getTime()
      : Date.now();
    return {
      attemptId: row.id,
      totalScore: resultsReleased ? row.total_score : null,
      attemptNumber: row.attempt_number,
      submittedAt: row.completed_at ?? row.started_at,
      durationSeconds: Math.floor((endMs - startMs) / 1000),
    };
  });

  // 5) Questions
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
  const questions = (rawQ || []).map((r) => ({
    quizId: r.quiz_id,
    question: r.workspace_quizzes.question,
    score: r.workspace_quizzes.score,
    instruction: r.workspace_quizzes.instruction,
    multiple:
      r.workspace_quizzes.quiz_options.filter((o) => o.is_correct).length > 1,
    options: r.workspace_quizzes.quiz_options.map((o) => ({
      id: o.id,
      value: o.value,
    })),
  }));

  const maxScore = questions.reduce((a, c) => a + c.score, 0);

  // 6) Flags
  const now = new Date();
  const isAvailable = !availableDate || new Date(availableDate) <= now;
  const isPastDue = !!dueDate && new Date(dueDate) < now;
  const hasReachedMax = attemptLimit !== null && attemptsSoFar >= attemptLimit;

  // 7) Payload
  const payload: TakeResponse = {
    setId,
    setName,
    timeLimitMinutes,
    attemptLimit,
    attemptsSoFar,
    allowViewOldAttempts,
    availableDate,
    dueDate,
    resultsReleased,
    explanationMode: explanationMode as 0 | 1 | 2,
    instruction,
    attempts,
    maxScore,
    questions,
    isAvailable,
    isPastDue,
    hasReachedMax,
  };

  return NextResponse.json(payload);
}
