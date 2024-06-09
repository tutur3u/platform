import { Transaction } from '@/types/primitives/Transaction';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const data: Transaction & {
    origin_wallet_id?: string;
    destination_wallet_id?: string;
  } = await req.json();

  const newData = {
    ...data,
    wallet_id: data.origin_wallet_id,
  };

  delete newData.origin_wallet_id;
  delete newData.destination_wallet_id;

  const { error } = await supabase
    .from('wallet_transactions')
    .upsert(newData)
    .eq('id', data.id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
