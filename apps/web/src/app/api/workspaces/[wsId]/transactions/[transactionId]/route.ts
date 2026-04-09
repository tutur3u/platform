import { createClient } from '@ncthub/supabase/next/server';
import type { Transaction } from '@ncthub/types/primitives/Transaction';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    transactionId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { transactionId } = await params;

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('id', transactionId)
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

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { transactionId } = await params;

  const data: Transaction & {
    origin_wallet_id?: string;
    destination_wallet_id?: string;
  } = await req.json();

  const {
    origin_wallet_id,
    destination_wallet_id,
    category,
    wallet,
    href,
    ws_id,
    ...rest
  } = data;

  const newData = {
    ...rest,
    wallet_id: origin_wallet_id,
  };

  const { error } = await supabase
    .from('wallet_transactions')
    .update(newData)
    .eq('id', transactionId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { transactionId } = await params;

  const { error } = await supabase
    .from('wallet_transactions')
    .delete()
    .eq('id', transactionId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
