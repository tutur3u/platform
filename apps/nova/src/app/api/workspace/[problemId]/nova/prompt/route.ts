import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    problemId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { problemId: id } = await params;

  const { data, error } = await supabase
    .from('nova_users_problem_history')
    .select('*')
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace wallets' },
      { status: 500 }
    );
  }
  return NextResponse.json(data);
}
