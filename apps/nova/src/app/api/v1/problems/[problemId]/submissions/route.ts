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

  const { data: submissions, error } = await supabase
    .from('nova_submissions')
    .select('*')
    .eq('problem_id', problemId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching submissions' },
      { status: 500 }
    );
  }

  return NextResponse.json(submissions);
}

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { prompt, feedback, score } = await request.json();
  const { problemId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!prompt || !feedback || score === undefined) {
    return NextResponse.json(
      { message: 'Prompt, feedback, and score are required' },
      { status: 400 }
    );
  }

  // Insert the new submission into the `nova_submissions` table
  const { error: insertError } = await supabase
    .from('nova_submissions')
    .insert({
      prompt: prompt,
      feedback: feedback,
      score: score,
      problem_id: problemId,
      user_id: user.id,
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating submission:', insertError);
    return NextResponse.json(
      { message: 'Error creating submission' },
      { status: 500 }
    );
  }

  const { data: challenge, error: challengeError } = await supabase
    .from('nova_challenges')
    .select('id')
    .eq('id', problemId)
    .single();

  if (challengeError) {
    console.error('Error fetching challenge:', challengeError);
    return NextResponse.json(
      { message: 'Error fetching challenge' },
      { status: 500 }
    );
  }

  const { error: rpcError } = await supabase.rpc('calculate_total_score', {
    challenge_id_param: challenge?.id as never,
    user_id_param: user.id as never,
  });

  if (rpcError) {
    console.error('Error updating total score:', rpcError);
    return NextResponse.json(
      { message: 'Error updating total score' },
      { status: 500 }
    );
  }

  return NextResponse.json('Submission created and total score updated', {
    status: 201,
  });
}
