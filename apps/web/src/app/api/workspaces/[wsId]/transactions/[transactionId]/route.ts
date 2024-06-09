import { Transaction } from '@/types/primitives/Transaction';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    transactionId: string;
  };
}

export async function GET(
  _: Request,
  { params: { transactionId: id } }: Params
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(
  req: Request,
  { params: { transactionId: id } }: Params
) {
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
    .update(newData)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(
  _: Request,
  { params: { transactionId: id } }: Params
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase
    .from('wallet_transactions')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
