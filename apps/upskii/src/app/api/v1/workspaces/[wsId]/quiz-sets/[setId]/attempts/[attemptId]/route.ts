// File: app/api/quiz-sets/[setId]/attempts/[attemptId]/route.ts
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { setId: string; attemptId: string } }
) {
  const { setId, attemptId } = params;
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

  // 2) Check allow_view_results
  const { data: setRow, error: sErr } = await sb
    .from('workspace_quiz_sets')
    .select('release_points_immediately, results_released, explanation_mode')
    .eq('id', setId)
    .maybeSingle();
  if (sErr || !setRow) {
    return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
  }
  const { release_points_immediately, results_released, explanation_mode } =
    setRow;
  if (!release_points_immediately && !results_released) {
    return NextResponse.json(
      { error: 'Results are not yet released' },
      { status: 403 }
    );
  }

  // 3) Load attempt (ensure user & set match)
  const { data: attRow, error: attErr } = await sb
    .from('workspace_quiz_attempts')
    .select('id,attempt_number,total_score,started_at,completed_at')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .eq('set_id', setId)
    .maybeSingle();
  if (attErr || !attRow) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
  }

  // Compute duration
  const started = new Date(attRow.started_at).getTime();
  const completed = attRow.completed_at
    ? new Date(attRow.completed_at).getTime()
    : Date.now();
  const durationSeconds = Math.round((completed - started) / 1000);

  // 4) Fetch all questions + options + weight
  const { data: qRaw, error: qErr } = await sb
    .from('quiz_set_quizzes')
    .select(
      `
      quiz_id,
      workspace_quizzes ( question, score ),
      quiz_options ( id, value, is_correct, explanation )
    `
    )
    .eq('set_id', setId);
  if (qErr) {
    return NextResponse.json(
      { error: 'Error fetching questions' },
      { status: 500 }
    );
  }

  type QRow = {
    quiz_id: string;
    workspace_quizzes: { question: string; score: number };
    quiz_options: Array<{
      id: string;
      value: string;
      is_correct: boolean;
      explanation: string | null;
    }>;
  };
  const questionsInfo = (qRaw as QRow[]).map((r) => ({
    quizId: r.quiz_id,
    question: r.workspace_quizzes.question,
    scoreWeight: r.workspace_quizzes.score,
    options: r.quiz_options.map((o) => ({
      id: o.id,
      value: o.value,
      isCorrect: o.is_correct,
      explanation: o.explanation,
    })),
  }));
  const maxPossibleScore = questionsInfo.reduce(
    (sum, q) => sum + q.scoreWeight,
    0
  );

  // 5) Load this attempt’s answers
  const { data: ansRows, error: ansErr } = await sb
    .from('workspace_quiz_attempt_answers')
    .select('quiz_id, selected_option_id, is_correct, score_awarded')
    .eq('attempt_id', attemptId);
  if (ansErr) {
    return NextResponse.json(
      { error: 'Error fetching answers' },
      { status: 500 }
    );
  }
  const ansMap = new Map(ansRows.map((a) => [a.quiz_id, a]));

  // 6) Build detailed questions
  const detailed = questionsInfo.map((q) => {
    const a = ansMap.get(q.quizId);
    return {
      quizId: q.quizId,
      question: q.question,
      scoreWeight: q.scoreWeight,
      selectedOptionId: a?.selected_option_id || null,
      isCorrect: a?.is_correct ?? false,
      scoreAwarded: a?.score_awarded ?? 0,
      options: q.options.map((opt) => {
        // Only show explanation per explanation_mode:
        let explanation: string | null = null;
        if (explanation_mode === 2) explanation = opt.explanation;
        else if (explanation_mode === 1 && opt.isCorrect)
          explanation = opt.explanation;
        return {
          id: opt.id,
          value: opt.value,
          isCorrect: opt.isCorrect,
          explanation,
        };
      }),
    };
  });

  return NextResponse.json({
    attemptId: attRow.id,
    attemptNumber: attRow.attempt_number,
    totalScore: attRow.total_score ?? 0,
    maxPossibleScore,
    startedAt: attRow.started_at,
    completedAt: attRow.completed_at,
    durationSeconds,
    explanationMode: explanation_mode,
    questions: detailed,
  });
}
