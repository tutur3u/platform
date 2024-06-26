import { Wallet } from '@/types/primitives/Wallet';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    wsId: string;
  };
}

export async function GET(_: Request, { params: { wsId } }: Params) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_wallets')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching transaction categories' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params: { wsId } }: Params) {
  const supabase = createClient();

  const data: Wallet = await req.json();

  const { error } = await supabase.from('workspace_wallets').upsert({
    ...data,
    ws_id: wsId,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace wallets' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
