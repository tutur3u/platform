// File: app/api/quiz-sets/[setId]/attempts/route.ts
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

interface QuizSetRow {
  release_points_immediately: boolean;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const { setId } = params;
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

  // 2) Check allow_view_results flag
  const { data: setRow, error: sErr } = await sb
    .from('workspace_quiz_sets')
    .select('release_points_immediately')
    .eq('id', setId)
    .maybeSingle();

  if (sErr || !setRow) {
    return NextResponse.json({ error: 'Quiz set not found' }, { status: 404 });
  }

  const { release_points_immediately } = setRow;
  if (!release_points_immediately ) {
    return NextResponse.json(
      { error: 'Results are not yet released' },
      { status: 403 }
    );
  }

  // 3) Fetch all attempts for this user & set
  const { data: attempts, error: aErr } = await sb
    .from('workspace_quiz_attempts')
    .select(
      `
      id,
      attempt_number,
      total_score,
      started_at,
      completed_at
    `
    )
    .eq('user_id', userId)
    .eq('set_id', setId)
    .order('attempt_number', { ascending: false });
  if (aErr) {
    return NextResponse.json(
      { error: 'Error fetching attempts' },
      { status: 500 }
    );
  }
  if (!attempts.length) {
    return NextResponse.json({ attempts: [] });
  }

  // 4) For each attempt, compute durationSeconds
  const summaries = attempts.map((att) => {
    const started = new Date(att.started_at).getTime();
    const completed = att.completed_at
      ? new Date(att.completed_at).getTime()
      : Date.now();
    const durationSeconds = Math.round((completed - started) / 1000);
    return {
      attemptId: att.id,
      attemptNumber: att.attempt_number,
      totalScore: att.total_score ?? 0,
      startedAt: att.started_at,
      completedAt: att.completed_at,
      durationSeconds,
    };
  });

  return NextResponse.json({ attempts: summaries });
}
