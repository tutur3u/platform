import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    categoryId: string;
  };
}

export async function GET(_: Request, { params: { categoryId: id } }: Params) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('transaction_categories')
    .select('*')
    .eq('id', id)
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
