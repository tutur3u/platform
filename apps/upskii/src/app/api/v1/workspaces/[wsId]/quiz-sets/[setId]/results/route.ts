// File: app/api/quiz-sets/[setId]/results/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@tuturuuu/supabase/next/server';

type QuestionInfo = {
  quizId: string;
  question: string;
  correctOptionId: string;
  correctOptionValue: string;
  scoreWeight: number;
};

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
  totalScore: number;         // must be a number, not null
  maxPossibleScore: number;
  startedAt: string;
  completedAt: string | null;
  answers: AttemptAnswer[];
};

export async function GET(
  request: NextRequest,
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

  // 2) Fetch quiz_set metadata (release rules)
  const { data: setRow, error: setErr } = await supabase
    .from('workspace_quiz_sets')
    .select('release_points_immediately, release_at')
    .eq('id', setId)
    .maybeSingle();

  if (setErr || !setRow) {
    return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
  }
  const { release_points_immediately, release_at } = setRow;

  // Compute whether results are visible
  let allowView = false;
  if (release_points_immediately) {
    allowView = true;
  } else if (release_at) {
    const now = new Date();
    if (new Date(release_at) <= now) {
      allowView = true;
    }
  }
  if (!allowView) {
    return NextResponse.json(
      { error: 'Results are not yet released' },
      { status: 403 }
    );
  }

  // 3) Fetch ALL questions in this set, with correct option and weight
  const { data: questionsRaw, error: qErr } = await supabase
    .from('quiz_set_quizzes')
    .select(`
      quiz_id,
      workspace_quizzes (
        question,
        score
      ),
      quiz_options!inner (
        id,
        value
      )
    `)
    .eq('set_id', setId)
    .eq('quiz_options.is_correct', true);

  if (qErr) {
    return NextResponse.json({ error: 'Error fetching questions' }, { status: 500 });
  }

  // Build questionInfo array
  const questionInfo: QuestionInfo[] = (questionsRaw || []).map((row: any) => ({
    quizId: row.quiz_id,
    question: row.workspace_quizzes.question,
    scoreWeight: row.workspace_quizzes.score,
    correctOptionId: row.quiz_options.id,
    correctOptionValue: row.quiz_options.value,
  }));
  const qMap = new Map<string, QuestionInfo>();
  questionInfo.forEach((q) => {
    qMap.set(q.quizId, q);
  });

  // 4) Fetch all attempts by this user for this set
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

  // 5) Compute maxPossibleScore once
  const maxPossibleScore = questionInfo.reduce((acc, q) => acc + q.scoreWeight, 0);

  // 6) For each attempt, fetch its answers and build AttemptDTO
  const resultDTOs: AttemptDTO[] = [];

  for (const att of attempts) {
    // 6a) Fetch all answers for this attempt
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
      return NextResponse.json(
        { error: 'Error fetching attempt answers' },
        { status: 500 }
      );
    }

    // Build a map: quizId → answerRow
    const aMap = new Map<string, any>();
    (answerRows || []).forEach((a: any) => {
      aMap.set(a.quiz_id, a);
    });

    // 6b) For each question, assemble AttemptAnswer
    const answers: AttemptAnswer[] = await Promise.all(questionInfo.map(async (qi) => {
      const aRow = aMap.get(qi.quizId);
      if (aRow) {
        // Student answered the question
        // Fetch selected option’s text
        const { data: selOptRow, error: selErr } = await supabase
          .from('quiz_options')
          .select('value')
          .eq('id', aRow.selected_option_id)
          .maybeSingle();
        const selectedValue = selErr || !selOptRow ? '' : selOptRow.value;

        return {
          quizId: qi.quizId,
          question: qi.question,
          selectedOption: selectedValue,
          correctOption: qi.correctOptionValue,
          isCorrect: aRow.is_correct,
          scoreAwarded: aRow.score_awarded,
        };
      } else {
        // Student left it blank
        return {
          quizId: qi.quizId,
          question: qi.question,
          selectedOption: null,
          correctOption: qi.correctOptionValue,
          isCorrect: false,
          scoreAwarded: 0,
        };
      }
    }));

    // 6c) Build the AttemptDTO, coercing total_score to 0 if null
    resultDTOs.push({
      attemptId: att.id,
      attemptNumber: att.attempt_number,
      totalScore: att.total_score ?? 0,    // <-- coerce null to 0
      maxPossibleScore,
      startedAt: att.started_at,
      completedAt: att.completed_at,
      answers,
    });
  }

  // 7) Return the assembled DTOs
  return NextResponse.json({ attempts: resultDTOs });
}
