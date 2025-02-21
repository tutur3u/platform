import { createClient } from '@tutur3u/supabase/next/server';
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
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('nova_test_timer_record')
    .select('duration, created_at, test_status')
    .eq('problem_id', problemId)
    .eq('user_id', user.id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching timer in route' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { problemId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log('Unauthorized');
    return;
  }

  const { duration, test_status } = await req.json();

  const upsertData = {
    user_id: user?.id,
    problem_id: problemId,
    duration: duration,
    test_status: test_status,
  };

  const { error } = await supabase
    .from('nova_test_timer_record')
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

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { problemId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log('Unauthorized');
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const userId = user?.id;
  const { test_status } = await req.json();

  if (!test_status) {
    return NextResponse.json(
      { message: 'Missing test_status' },
      { status: 400 }
    );
  }

  // Update the test status
  const { error } = await supabase
    .from('nova_test_timer_record')
    .update({ test_status })
    .eq('problem_id', problemId)
    .eq('user_id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating test status' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Test status updated successfully' });
}
