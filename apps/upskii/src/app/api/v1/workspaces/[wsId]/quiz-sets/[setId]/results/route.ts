// app/api/quiz-sets/[setId]/results/route.ts
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    setId: string;
  }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { setId } = await params;
  const sb = await createClient();

  // Auth
  const {
    data: { user },
    error: uErr,
  } = await sb.auth.getUser();
  if (uErr || !user)
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const uid = user.id;

  // Check allow_view_results
  const { data: s, error: sErr } = await sb
    .from('workspace_quiz_sets')
    .select('allow_view_results')
    .eq('id', setId)
    .maybeSingle();
  if (sErr || !s)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!s.allow_view_results) {
    return NextResponse.json({ error: 'Viewing disabled' }, { status: 403 });
  }

  // Fetch correct answers & weight
  const { data: qRaw, error: qErr } = await sb
    .from('quiz_set_quizzes')
    .select(
      `
      quiz_id,
      workspace_quizzes(score),
      quiz_options!inner(value)  -- only correct by join filter
    `
    )
    .eq('set_id', setId)
    .eq('quiz_options.is_correct', true);
  if (qErr)
    return NextResponse.json({ error: 'Q fetch error' }, { status: 500 });

  type Q = {
    quiz_id: string;
    workspace_quizzes: { score: number };
    quiz_options: { value: string };
  };
  const info = (qRaw as unknown as Q[]).map((r) => ({
    quizId: r.quiz_id,
    weight: r.workspace_quizzes.score,
    correct: r.quiz_options.value,
  }));
  const maxScore = info.reduce((a, c) => a + c.weight, 0);

  // Fetch attempts
  const { data: aData, error: aErr } = await sb
    .from('workspace_quiz_attempts')
    .select(
      `
      id,
      attempt_number,
      total_score,
      submitted_at,
      duration_seconds
    `
    )
    .eq('user_id', uid)
    .eq('set_id', setId)
    .order('attempt_number', { ascending: false });
  if (aErr)
    return NextResponse.json({ error: 'Attempt fetch error' }, { status: 500 });

  const results = await Promise.all(
    aData!.map(async (att) => {
      const { data: ansRows } = await sb
        .from('workspace_quiz_attempt_answers')
        .select('quiz_id,selected_option_id,is_correct,score_awarded')
        .eq('attempt_id', att.id);

      const ansMap = new Map(ansRows!.map((r) => [r.quiz_id, r]));
      const answers = info.map(async (qi) => {
        const ar = ansMap.get(qi.quizId);
        return {
          quizId: qi.quizId,
          correctOption: qi.correct,
          selectedOption: ar
            ? await (() =>
                sb
                  .from('quiz_options')
                  .select('value')
                  .eq('id', ar.selected_option_id)
                  .maybeSingle()
                  .then((r) => r.data?.value || null))()
            : null,
          isCorrect: ar?.is_correct ?? false,
          scoreAwarded: ar?.score_awarded ?? 0,
        };
      });

      return {
        attemptId: att.id,
        attemptNumber: att.attempt_number,
        totalScore: att.total_score ?? 0,
        maxPossibleScore: maxScore,
        submittedAt: att.submitted_at,
        durationSeconds: att.duration_seconds,
        answers,
      };
    })
  );

  return NextResponse.json({ attempts: results });
}
