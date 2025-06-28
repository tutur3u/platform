// app/api/quiz-sets/[setId]/attempts/[attemptId]/route.ts
import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    setId: string;
    attemptId: string;
  }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { setId, attemptId } = await params;
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

  // 2) Load our two flags
  const { data: setRow, error: sErr } = await sb
    .from('workspace_quiz_sets')
    .select('allow_view_old_attempts, results_released, explanation_mode')
    .eq('id', setId)
    .maybeSingle();
  if (sErr || !setRow) {
    return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
  }
  const {
    allow_view_old_attempts: allowViewOldAttempts,
    results_released: allowViewResult,
    explanation_mode,
  } = setRow;

  // 3) Load attempt header
  const { data: attRow, error: attErr } = await sb
    .from('workspace_quiz_attempts')
    .select('id, attempt_number, started_at, completed_at')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .eq('set_id', setId)
    .maybeSingle();
  if (attErr || !attRow) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
  }
  const startedMs = new Date(attRow.started_at).getTime();
  const completedMs = attRow.completed_at
    ? new Date(attRow.completed_at).getTime()
    : Date.now();
  const durationSeconds = Math.round((completedMs - startedMs) / 1000);

  // 4) Branch #1: neither summary‐only nor full detail allowed ⇒ return only summary
  if (!allowViewOldAttempts && !allowViewResult) {
    return NextResponse.json({
      attemptId: attRow.id,
      attemptNumber: attRow.attempt_number,
      submittedAt: attRow.completed_at,
      durationSeconds,
    });
  }

  const { data: ansRows, error: ansErr } = await sb
    .from('workspace_quiz_attempt_answers')
    .select('quiz_id, selected_option_id, is_correct, score_awarded')
    .eq('attempt_id', attemptId);
  if (ansErr || !ansRows) {
    return NextResponse.json(
      { error: 'Error fetching answers' },
      { status: 500 }
    );
  }
  const ansMap = new Map(ansRows.map((a) => [a.quiz_id, a]));

  // 6) Branch #2: summary‐only allowed (old attempts) ⇒ show question+user‐answer, but no correctness or points
  if (allowViewOldAttempts && !allowViewResult) {
    // re-fetch questions including options
    const { data: sumQRaw, error: sumQErr } = await sb
      .from('quiz_set_quizzes')
      .select(
        `
        quiz_id,
        workspace_quizzes (
          question,
          quiz_options (
            id,
            value
          )
        )
      `
      )
      .eq('set_id', setId);
    if (sumQErr || !sumQRaw) {
      return NextResponse.json(
        { error: 'Error fetching summary questions' },
        { status: 500 }
      );
    }

    type SumRow = {
      quiz_id: string;
      workspace_quizzes: {
        question: string;
        quiz_options: Array<{
          id: string;
          value: string;
        }>;
      };
    };

    const questions = (sumQRaw as SumRow[]).map((r) => {
      const a = ansMap.get(r.quiz_id);
      return {
        quizId: r.quiz_id,
        question: r.workspace_quizzes.question,
        selectedOptionId: a?.selected_option_id ?? null,
        options: r.workspace_quizzes.quiz_options.map((opt) => ({
          id: opt.id,
          value: opt.value,
        })),
      };
    });

    return NextResponse.json({
      attemptId: attRow.id,
      attemptNumber: attRow.attempt_number,
      submittedAt: attRow.completed_at,
      durationSeconds,
      questions,
    });
  }

  // 7) Branch #3: full detail allowed (results_released) ⇒ include correctness, score, explanations
  // 7a) we need each question’s options, weights, explanations
  const { data: fullQRaw, error: fullQErr } = await sb
    .from('quiz_set_quizzes')
    .select(
      `
      quiz_id,
      workspace_quizzes (
        question,
        score,
        quiz_options (
          id,
          value,
          is_correct,
          explanation
        )
      )
    `
    )
    .eq('set_id', setId);
  if (fullQErr || !fullQRaw) {
    return NextResponse.json(
      { error: 'Error fetching full questions' },
      { status: 500 }
    );
  }
  type FullRow = {
    quiz_id: string;
    workspace_quizzes: {
      question: string;
      score: number;
      quiz_options: Array<{
        id: string;
        value: string;
        is_correct: boolean;
        explanation: string | null;
      }>;
    };
  };
  const detailedQuestions = (fullQRaw as FullRow[]).map((r) => {
    const a = ansMap.get(r.quiz_id);
    return {
      quizId: r.quiz_id,
      question: r.workspace_quizzes.question,
      scoreWeight: r.workspace_quizzes.score,
      selectedOptionId: a?.selected_option_id ?? null,
      isCorrect: a?.is_correct ?? false,
      scoreAwarded: a?.score_awarded ?? 0,
      options: r.workspace_quizzes.quiz_options.map((opt) => {
        let explanation: string | null = null;
        if (explanation_mode === 2) {
          explanation = opt.explanation;
        } else if (explanation_mode === 1 && opt.is_correct) {
          explanation = opt.explanation;
        }
        return {
          id: opt.id,
          value: opt.value,
          isCorrect: opt.is_correct,
          explanation,
        };
      }),
    };
  });

  const maxPossibleScore = detailedQuestions.reduce(
    (sum, q) => sum + q.scoreWeight,
    0
  );

  return NextResponse.json({
    attemptId: attRow.id,
    attemptNumber: attRow.attempt_number,
    totalScore: ansRows.reduce((sum, a) => sum + (a.score_awarded ?? 0), 0),
    maxPossibleScore,
    startedAt: attRow.started_at,
    completedAt: attRow.completed_at,
    durationSeconds,
    explanationMode: explanation_mode,
    questions: detailedQuestions,
  });
}
