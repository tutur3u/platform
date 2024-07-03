import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    walletId: string;
  };
}

export async function GET(_: Request, { params: { walletId: id } }: Params) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_wallets')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace wallets' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params: { walletId: id } }: Params) {
  const supabase = createClient();
  const data = await req.json();

  const { error } = await supabase
    .from('workspace_wallets')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace wallets' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params: { walletId: id } }: Params) {
  const supabase = createClient();

  const { error } = await supabase
    .from('workspace_wallets')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace wallets' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
