import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const data = await req.json();
  const { wsId: id } = await params;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { error } = await sbAdmin
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
