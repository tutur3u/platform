import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    problemId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { problemId: id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    console.log('Unauthorized');
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('nova_users_problem_history')
    .select('score, feedback, user_prompt')
    .eq('problem_id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching problem history' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (!user) {
    console.log('Unauthorized');
    return;
  }
  if (authError) {
    console.log(authError);
  }

  const { problemId: id } = await params;

  const { feedback, score, user_prompt, challengeId } = await req.json();

  const upsertData = {
    user_id: user?.id,
    problem_id: id,
    feedback: feedback || '',
    score: score || 0,
    user_prompt: user_prompt,
    problem_set_id: challengeId || '',
  };

  const { error } = await supabase
    .from('nova_users_problem_history')
    .upsert(upsertData);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating problem history' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Problem history updated successfully' });
}
