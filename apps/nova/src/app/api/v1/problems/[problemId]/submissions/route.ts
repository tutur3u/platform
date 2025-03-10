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
  const { input, output, score } = await request.json();
  const { problemId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!input || !output || score === undefined) {
    return NextResponse.json(
      { message: 'Input, output, and score are required' },
      { status: 400 }
    );
  }

  const { data: newSubmission, error } = await supabase
    .from('nova_submissions')
    .insert({
      input: input,
      output: output,
      score: score,
      problem_id: problemId,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating submission:', error);
    return NextResponse.json(
      { message: 'Error creating submission' },
      { status: 500 }
    );
  }

  const { data: problem, error: problemError } = await supabase
    .from('nova_submission_highest_score')
    .select('id, highest_score')
    .eq('id', problemId)
    .single();

  if (problemError) {
    const { error: insertError } = await supabase
      .from('nova_submission_highest_score')
      .insert({
        problem_id: problemId,
        highest_score: score,
        user_id: user.id,
      });

    if (insertError) {
      console.error('Error creating highest score record:', insertError);
    }
  } else if (problem.highest_score !== null && score > problem.highest_score) {
    const { error: updateError } = await supabase
      .from('nova_submission_highest_score')
      .update({
        highest_score: score,
        user_id: user.id,
      })
      .eq('id', problemId);

    if (updateError) {
      console.error('Error updating highest score record:', updateError);
    }
  }

  return NextResponse.json(newSubmission);
}
