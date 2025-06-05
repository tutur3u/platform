// File: app/api/quiz-sets/[setId]/submit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@tuturuuu/supabase/next/server';

type SubmissionBody = {
  answers: Array<{
    quizId: string;
    selectedOptionId: string;
  }>;
};

type RawRow = {
  quiz_id: string;
  workspace_quizzes: {
    score: number;
    quiz_options: Array<{
      id: string;
      is_correct: boolean;
    }>;
  };
};

export async function POST(
  request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const setId = params.setId;
  const supabase = await createClient();

  // 1) Get current user
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = user.id;

  // 2) Parse request body
  let body: SubmissionBody;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { answers } = body;
  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'No answers provided' }, { status: 400 });
  }

  // 3) Re-compute attempt_count for this user/set
  const { data: prevAttempts, error: attErr } = await supabase
    .from('workspace_quiz_attempts')
    .select('attempt_number', { count: 'exact', head: false })
    .eq('user_id', userId)
    .eq('set_id', setId);

  if (attErr) {
    return NextResponse.json({ error: 'Error counting attempts' }, { status: 500 });
  }
  const attemptsCount = prevAttempts?.length || 0;

  // 4) Fetch attempt_limit for this quiz set
  const { data: setRow, error: setErr } = await supabase
    .from('workspace_quiz_sets')
    .select('attempt_limit')
    .eq('id', setId)
    .maybeSingle();

  if (setErr || !setRow) {
    return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
  }
  const { attempt_limit } = setRow;
  if (
    attempt_limit !== null &&
    attempt_limit !== undefined &&
    attemptsCount >= attempt_limit
  ) {
    return NextResponse.json({ error: 'Maximum attempts reached' }, { status: 403 });
  }

  // 5) We will create a new attempt row with attempt_number = attemptsCount + 1
  const newAttemptNumber = attemptsCount + 1;

  // 6) Fetch "correct" answers + per-question score for each quiz in this set.
  //    Notice we nest `quiz_options` under `workspace_quizzes`:
  const { data: correctRaw, error: corrErr } = await supabase
    .from('quiz_set_quizzes')
    .select(`
      quiz_id,
      workspace_quizzes (
        score,
        quiz_options (
          id,
          is_correct
        )
      )
    `)
    .eq('set_id', setId);

  if (corrErr) {
    return NextResponse.json({ error: 'Error fetching correct answers' }, { status: 500 });
  }

  // 7) Tell TypeScript: "Trust me—this matches RawRow[]"
  const correctRows = (correctRaw as unknown as RawRow[]) ?? [];

  // Build a map: quizId → { score: number, correctOptionId: string }
  const quizMap = new Map<string, { score: number; correctOptionId: string }>();
  correctRows.forEach((row) => {
    const qId = row.quiz_id;
    const weight = row.workspace_quizzes.score;

    // Find exactly one correct option (is_correct = true)
    const correctOption = row.workspace_quizzes.quiz_options.find(
      (opt) => opt.is_correct
    )?.id;

    quizMap.set(qId, { score: weight, correctOptionId: correctOption || '' });
  });

  // 8) Loop through submitted answers, compare to correctOptionId, sum up total_score
  let totalScore = 0;
  const answerInserts: Array<{
    quiz_id: string;
    selected_option_id: string;
    is_correct: boolean;
    score_awarded: number;
  }> = [];

  for (const { quizId, selectedOptionId } of answers) {
    const qInfo = quizMap.get(quizId);
    if (!qInfo) {
      // If the quizId isn't in our map, ignore it
      continue;
    }
    const { score: weight, correctOptionId } = qInfo;
    const isCorrect = selectedOptionId === correctOptionId;
    const awarded = isCorrect ? weight : 0;
    totalScore += awarded;

    answerInserts.push({
      quiz_id: quizId,
      selected_option_id: selectedOptionId,
      is_correct: isCorrect,
      score_awarded: awarded,
    });
  }

  // 9) Insert the attempt row
  const { data: insertedAttempt, error: insErr } = await supabase
    .from('workspace_quiz_attempts')
    .insert([
      {
        user_id: userId,
        set_id: setId,
        attempt_number: newAttemptNumber,
        total_score: totalScore,
      },
    ])
    .select('id')
    .single();

  if (insErr || !insertedAttempt) {
    return NextResponse.json({ error: 'Error inserting attempt' }, { status: 500 });
  }
  const attemptId = insertedAttempt.id;

  // 10) Insert each answer into workspace_quiz_attempt_answers
  const { error: ansErr } = await supabase
    .from('workspace_quiz_attempt_answers')
    .insert(
      answerInserts.map((a) => ({
        attempt_id: attemptId,
        quiz_id: a.quiz_id,
        selected_option_id: a.selected_option_id,
        is_correct: a.is_correct,
        score_awarded: a.score_awarded,
      }))
    );

  if (ansErr) {
    return NextResponse.json({ error: 'Error inserting answers' }, { status: 500 });
  }

  // 11) Mark the attempt’s completed_at timestamp
  const { error: updErr } = await supabase
    .from('workspace_quiz_attempts')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', attemptId);

  if (updErr) {
    console.error('Warning: could not update completed_at', updErr);
    // Not fatal—still return success
  }

  // 12) Return the result to the client
  return NextResponse.json({
    attemptId,
    attemptNumber: newAttemptNumber,
    totalScore,
    maxPossibleScore: Array.from(quizMap.values()).reduce(
      (acc, { score }) => acc + score,
      0
    ),
  });
}
