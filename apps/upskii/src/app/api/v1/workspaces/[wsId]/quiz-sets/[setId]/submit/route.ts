import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

type SubmissionBody = {
  answers: Array<{
    quizId: string;
    selectedOptionId: string;
  }>;
};

interface Params {
  params: Promise<{
    setId: string;
  }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { setId } = await params;
  const sb = await createClient();

  // 1) Authenticate
  const {
    data: { user },
    error: uErr,
  } = await sb.auth.getUser();
  if (uErr || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = user.id;

  // 2) Parse and validate body
  let body: SubmissionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return NextResponse.json({ error: 'No answers provided' }, { status: 400 });
  }

  // 3) Count existing attempts
  const { data: prevAtt, error: countErr } = await sb
    .from('workspace_quiz_attempts')
    .select('attempt_number', { count: 'exact', head: false })
    .eq('user_id', userId)
    .eq('set_id', setId);
  if (countErr) {
    return NextResponse.json(
      { error: 'Error counting attempts' },
      { status: 500 }
    );
  }
  const attemptsCount = prevAtt?.length ?? 0;

  // 4) Load quiz-set constraints & flags
  const { data: setRow, error: setErr } = await sb
    .from('workspace_quiz_sets')
    .select(
      `
      attempt_limit,
      time_limit_minutes,
      available_date,
      due_date,
      allow_view_old_attempts,
      results_released,
      explanation_mode
    `
    )
    .eq('id', setId)
    .maybeSingle();
  if (setErr || !setRow) {
    return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
  }
  const {
    attempt_limit,
    time_limit_minutes,
    available_date,
    due_date,
    allow_view_old_attempts,
    results_released,
    explanation_mode,
  } = setRow;

  // 5) Enforce limits & dates
  const now = new Date();
  if (new Date(available_date) > now) {
    return NextResponse.json(
      { error: 'Quiz not yet available', availableDate: available_date },
      { status: 403 }
    );
  }
  if (new Date(due_date) < now) {
    return NextResponse.json(
      { error: 'Quiz past due', dueDate: due_date },
      { status: 403 }
    );
  }
  if (attempt_limit !== null && attemptsCount >= attempt_limit) {
    return NextResponse.json(
      { error: 'Maximum attempts reached', attemptsSoFar: attemptsCount },
      { status: 403 }
    );
  }

  // 6) Fetch correct answers & weights
  const { data: correctRaw, error: corrErr } = await sb
    .from('quiz_set_quizzes')
    .select(
      `
      quiz_id,
      workspace_quizzes (
        score,
        quiz_options (
          id,
          is_correct
        )
      )
    `
    )
    .eq('set_id', setId);
  if (corrErr) {
    return NextResponse.json(
      { error: 'Error fetching answers' },
      { status: 500 }
    );
  }
  type R = {
    quiz_id: string;
    workspace_quizzes: {
      score: number;
      quiz_options: Array<{ id: string; is_correct: boolean }>;
    };
  };
  const quizMap = new Map<string, { score: number; correctId: string }>();
  (correctRaw as R[]).forEach((r) => {
    const correctOpt =
      r.workspace_quizzes.quiz_options.find((o) => o.is_correct)?.id || '';
    quizMap.set(r.quiz_id, {
      score: r.workspace_quizzes.score,
      correctId: correctOpt,
    });
  });

  // 7) Score each submitted answer
  let totalScore = 0;
  const answersToInsert = body.answers.map(({ quizId, selectedOptionId }) => {
    const info = quizMap.get(quizId);
    const isCorrect = info?.correctId === selectedOptionId;
    const awarded = isCorrect ? info!.score : 0;
    totalScore += awarded;
    return {
      quiz_id: quizId,
      selected_option_id: selectedOptionId,
      is_correct: isCorrect,
      score_awarded: awarded,
    };
  });

  // 8) Create attempt
  const newAttemptNumber = attemptsCount + 1;
  const { data: insAtt, error: insErr } = await sb
    .from('workspace_quiz_attempts')
    .insert({
      user_id: userId,
      set_id: setId,
      attempt_number: newAttemptNumber,
      total_score: totalScore,
      duration_seconds: 0, // we’ll patch this below
    })
    .select('id, started_at')
    .single();
  if (insErr || !insAtt) {
    return NextResponse.json(
      { error: 'Error inserting attempt' },
      { status: 500 }
    );
  }

  // 9) Insert answers
  const { error: ansErr } = await sb
    .from('workspace_quiz_attempt_answers')
    .insert(
      answersToInsert.map((a) => ({
        attempt_id: insAtt.id,
        ...a,
      }))
    );
  if (ansErr) {
    return NextResponse.json(
      { error: 'Error inserting answers' },
      { status: 500 }
    );
  }

  // 10) Mark completed_at & compute duration
  const completedAt = new Date().toISOString();
  await sb
    .from('workspace_quiz_attempts')
    .update({
      completed_at: completedAt,
      duration_seconds: Math.floor(
        (Date.now() - new Date(insAtt.started_at).getTime()) / 1000
      ),
    })
    .eq('id', insAtt.id);

  // 11) Build the full response DTO
  return NextResponse.json({
    // attempt meta
    attemptId: insAtt.id,
    attemptNumber: newAttemptNumber,
    totalScore,
    maxPossibleScore: Array.from(quizMap.values()).reduce(
      (sum, q) => sum + q.score,
      0
    ),
    startedAt: insAtt.started_at,
    completedAt,
    durationSeconds: Math.floor(
      (Date.now() - new Date(insAtt.started_at).getTime()) / 1000
    ),

    // quiz­set context
    attemptLimit: attempt_limit,
    attemptsSoFar: newAttemptNumber,
    timeLimitMinutes: time_limit_minutes,
    availableDate: available_date,
    dueDate: due_date,
    allowViewOldAttempts: allow_view_old_attempts,
    resultsReleased: results_released,
    explanationMode: explanation_mode,
  });
}
