import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export type AttemptSummary = {
  attemptId: string;
  attemptNumber: number;
  submittedAt: string;     // ISO
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
  questions: Array<{
    quizId: string;
    question: string;
    score: number;
    multiple: boolean;
    options: { id: string; value: string }[];
  }>;
  // NEW: explicit flags for UI
  isAvailable: boolean;
  isPastDue: boolean;
  hasReachedMax: boolean;
}

export async function GET(_req: NextRequest, { params }: { params: { setId: string } }) {
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

  // 2) Fetch quiz set metadata
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

  // 3) Count attempts so far
  const { data: prevAttempts, error: aErr } = await sb
    .from('workspace_quiz_attempts')
    .select('attempt_number', { head: false })
    .eq('user_id', userId)
    .eq('set_id', setId);
  if (aErr) {
    return NextResponse.json({ error: 'Error counting attempts' }, { status: 500 });
  }
  const attemptsSoFar = prevAttempts?.length ?? 0;

  // 4) Build summaries of past attempts
  const { data: rawAttempts, error: attErr } = await sb
    .from('workspace_quiz_attempts')
    .select('id,attempt_number,started_at,completed_at')
    .eq('user_id', userId)
    .eq('set_id', setId)
    .order('attempt_number', { ascending: false });
  if (attErr) {
    return NextResponse.json({ error: 'Error fetching attempts' }, { status: 500 });
  }
  const attempts: AttemptSummary[] = (rawAttempts || []).map((row) => {
    const started = new Date(row.started_at).getTime();
    const completed = row.completed_at
      ? new Date(row.completed_at).getTime()
      : Date.now();
    return {
      attemptId: row.id,
      attemptNumber: row.attempt_number,
      submittedAt: row.completed_at ?? row.started_at,
      durationSeconds: Math.floor((completed - started) / 1000),
    };
  });

  // 5) Fetch questions & options
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
    return NextResponse.json({ error: 'Error fetching questions' }, { status: 500 });
  }

  const questions = (rawQ || []).map((r: any) => ({
    quizId: r.quiz_id,
    question: r.workspace_quizzes.question,
    score: r.workspace_quizzes.score,
    multiple:
      r.workspace_quizzes.quiz_options.filter((o: any) => o.is_correct).length > 1,
    options: r.workspace_quizzes.quiz_options.map((o: any) => ({
      id: o.id,
      value: o.value,
    })),
  }));

  // 6) Derive UI flags
  const now = new Date();
  const isAvailable = !availableDate || new Date(availableDate) <= now;
  const isPastDue = !!dueDate && new Date(dueDate) < now;
  const hasReachedMax = attemptLimit !== null && attemptsSoFar >= attemptLimit;

  // 7) Return unified 200 response
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
    questions,
    isAvailable,
    isPastDue,
    hasReachedMax,
  };

  return NextResponse.json(payload);
}
