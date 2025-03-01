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
  const { user_prompt, score, feedback } = await request.json();
  const { problemId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Create initial submission record
  const { data: newSubmission, error } = await supabase
    .from('nova_submissions')
    .insert({
      user_prompt: user_prompt,
      score: score,
      feedback: feedback,
      problem_id: problemId,
      user_id: user.id,
    });

  if (error) {
    console.error('Error starting challenge:', error);
    return NextResponse.json(
      { message: 'Error starting challenge' },
      { status: 500 }
    );
  }

  return NextResponse.json(newSubmission);
}
