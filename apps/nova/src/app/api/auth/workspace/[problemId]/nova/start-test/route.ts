import { createClient } from '@/utils/supabase/server';
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

  if (!user) {
    console.log('Unauthorized');
  }
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('nova_test_timer_record')
    .select('duration, created_at')
    .eq('problemId', problemId)
    .eq('userId', userId)
    .single();

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
  const { duration, test_status } = await req.json();

  if (!user) {
    console.log('Unauthorized');
    return;
  }

  const upsertData = {
    userId: user?.id,
    problemId: problemId,
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
