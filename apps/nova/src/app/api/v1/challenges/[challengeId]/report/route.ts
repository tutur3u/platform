import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    challengeId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { challengeId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Get session, challenge info and submissions in a single query
  const { data: report, error } = await supabase
    .from('nova_sessions')
    .select(
      `
      *,
      challenge:nova_challenges(
        *,
        criteria:nova_challenge_criteria(*),
        problems:nova_problems(
          *,
          submissions:nova_submissions(*),
          criteria_scores:nova_problem_criteria_scores(*)
        )
      )
    `
    )
    .eq('challenge_id', challengeId)
    .eq('user_id', user.id)
    .single();

  if (error) {
    console.error('Error fetching challenge report:', error);
    return NextResponse.json(
      { message: 'Error fetching challenge report' },
      { status: 500 }
    );
  }

  return NextResponse.json(report);
}
