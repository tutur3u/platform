import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    categoryId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { categoryId } = await params;

  const { data, error } = await supabase
    .from('transaction_categories')
    .select('*')
    .eq('id', categoryId)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching transaction categories' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
