import { createClient } from '@tutur3u/supabase/next/server';
import { Wallet } from '@repo/types/primitives/Wallet';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId: id } = await params;

  const { error } = await supabase
    .from('workspace_wallets')
    .upsert(
      (data?.wallets || []).map((p: Wallet) => ({
        ...p,
        ws_id: id,
      }))
    )
    .eq('id', data.id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating workspace wallets' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
