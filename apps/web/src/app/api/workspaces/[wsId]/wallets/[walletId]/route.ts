import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    walletId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { walletId: id } = await params;

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

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { walletId: id } = await params;

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

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { walletId: id } = await params;

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
