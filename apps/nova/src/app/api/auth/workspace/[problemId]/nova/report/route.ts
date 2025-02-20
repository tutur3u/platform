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

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('nova_test_timer_record')
    .select('*')
    .eq('problemId', problemId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      {
        message: 'Error fetching record in route',
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json(data);
}
