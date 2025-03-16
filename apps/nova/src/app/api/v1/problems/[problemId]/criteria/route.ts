import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    problemId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { problemId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // First get the challenge_id from the problem
  const { data: problem, error: problemError } = await supabase
    .from('nova_problems')
    .select('challenge_id')
    .eq('id', problemId)
    .single();

  if (problemError) {
    console.error('Error fetching problem:', problemError);
    return NextResponse.json(
      { message: 'Error fetching problem' },
      { status: 500 }
    );
  }

  // Then get the criteria for the challenge
  const { data: criteria, error: criteriaError } = await supabase
    .from('nova_challenge_criteria')
    .select('*')
    .eq('challenge_id', problem.challenge_id);

  if (criteriaError) {
    console.error('Error fetching criteria:', criteriaError);
    return NextResponse.json(
      { message: 'Error fetching criteria' },
      { status: 500 }
    );
  }

  return NextResponse.json(criteria);
}
