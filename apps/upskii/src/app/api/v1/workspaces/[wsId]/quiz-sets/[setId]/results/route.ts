// File: app/api/quiz-sets/[setId]/results/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@tuturuuu/supabase/next/server';

type AttemptAnswer = {
  quizId: string;
  question: string;
  selectedOption: string | null;
  correctOption: string;
  isCorrect: boolean;
  scoreAwarded: number;
};
type AttemptDTO = {
  attemptId: string;
  attemptNumber: number;
  totalScore: number;
  maxPossibleScore: number;
  startedAt: string;
  completedAt: string | null;
  answers: AttemptAnswer[];
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

  // 2) Always allow if they have any attempts—and if allow_view_results is true
  const { data: setRow, error: setErr } = await supabase
    .from('workspace_quiz_sets')
    .select('allow_view_results')
    .eq('id', setId)
    .maybeSingle();

  if (setErr || !setRow) {
    return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
  }
  if (!setRow.allow_view_results) {
    return NextResponse.json({ error: 'Viewing results is disabled' }, { status: 403 });
  }

  // 3) Fetch question info (correct answers + weight)
  const { data: questionsRaw, error: qErr } = await supabase
    .from('quiz_set_quizzes')
    .select(`
      quiz_id,
      workspace_quizzes (
        question,
        score
      ),
      quiz_options!inner (
        value
      )
    `)
    .eq('set_id', setId)
    .eq('quiz_options.is_correct', true);

  if (qErr) {
    return NextResponse.json({ error: 'Error fetching questions' }, { status: 500 });
  }

  const questionInfo = (questionsRaw || []).map((row: any) => ({
    quizId: row.quiz_id,
    question: row.workspace_quizzes.question,
    scoreWeight: row.workspace_quizzes.score,
    correctOptionValue: row.quiz_options.value,
  }));
  const maxPossibleScore = questionInfo.reduce((s, q) => s + q.scoreWeight, 0);

  // 4) Fetch all attempts by user
  const { data: attemptsData, error: attemptsErr } = await supabase
    .from('workspace_quiz_attempts')
    .select(`
      id,
      attempt_number,
      total_score,
      started_at,
      completed_at
    `)
    .eq('user_id', userId)
    .eq('set_id', setId)
    .order('attempt_number', { ascending: false });

  if (attemptsErr) {
    return NextResponse.json({ error: 'Error fetching attempts' }, { status: 500 });
  }
  const attempts = attemptsData || [];
  if (!attempts.length) {
    return NextResponse.json({ error: 'No attempts found' }, { status: 404 });
  }

  // 5) For each attempt, fetch its answers
  const resultDTOs: AttemptDTO[] = [];

  for (const att of attempts) {
    const { data: answerRows, error: ansErr } = await supabase
      .from('workspace_quiz_attempt_answers')
      .select(`
        quiz_id,
        selected_option_id,
        is_correct,
        score_awarded
      `)
      .eq('attempt_id', att.id);

    if (ansErr) {
      return NextResponse.json({ error: 'Error fetching attempt answers' }, { status: 500 });
    }

    const aMap = new Map(answerRows!.map((a: any) => [a.quiz_id, a]));

    const answers = await Promise.all(
      questionInfo.map(async (qi) => {
        const a = aMap.get(qi.quizId);
        if (a) {
          const { data: selOpt, error: selErr } = await supabase
            .from('quiz_options')
            .select('value')
            .eq('id', a.selected_option_id)
            .maybeSingle();

          return {
            quizId: qi.quizId,
            question: qi.question,
            selectedOption: selErr || !selOpt ? null : selOpt.value,
            correctOption: qi.correctOptionValue,
            isCorrect: a.is_correct,
            scoreAwarded: a.score_awarded,
          };
        } else {
          return {
            quizId: qi.quizId,
            question: qi.question,
            selectedOption: null,
            correctOption: qi.correctOptionValue,
            isCorrect: false,
            scoreAwarded: 0,
          };
        }
      })
    );

    resultDTOs.push({
      attemptId: att.id,
      attemptNumber: att.attempt_number,
      totalScore: att.total_score ?? 0,
      maxPossibleScore,
      startedAt: att.started_at,
      completedAt: att.completed_at,
      answers,
    });
  }

  return NextResponse.json({ attempts: resultDTOs });
}
