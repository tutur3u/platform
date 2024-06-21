import { TransactionCategory } from '@/types/primitives/TransactionCategory';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    wsId: string;
  };
}

export async function PUT(req: Request, { params: { wsId: id } }: Params) {
  const supabase = createClient();

  const data = await req.json();

  const { error } = await supabase
    .from('transaction_categories')
    .upsert(
      (data?.categories || []).map((c: TransactionCategory) => ({
        ...c,
        ws_id: id,
      }))
    )
    .eq('id', data.id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating product categories' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
