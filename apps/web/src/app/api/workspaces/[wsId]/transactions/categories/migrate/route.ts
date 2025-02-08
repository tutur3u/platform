import { createClient } from '@repo/supabase/next/server';
import { TransactionCategory } from '@repo/types/primitives/TransactionCategory';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId } = await params;

  const { error } = await supabase
    .from('transaction_categories')
    .upsert(
      (data?.categories || []).map((c: TransactionCategory) => ({
        ...c,
        ws_id: wsId,
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
