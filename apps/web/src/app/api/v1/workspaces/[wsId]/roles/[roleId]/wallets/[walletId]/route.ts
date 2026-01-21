import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    roleId: string;
    walletId: string;
  }>;
}

// PUT - Update viewing window for a whitelisted wallet
export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, roleId, walletId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_workspace_roles')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { viewing_window, custom_days } = body;

  if (!viewing_window) {
    return NextResponse.json(
      { message: 'viewing_window is required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('workspace_role_wallet_whitelist')
    .update({
      viewing_window,
      custom_days: viewing_window === 'custom' ? custom_days : null,
    })
    .eq('role_id', roleId)
    .eq('wallet_id', walletId)
    .select()
    .single();

  if (error) {
    console.log(error);
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { message: 'Wallet whitelist entry not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { message: 'Error updating wallet whitelist' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

// DELETE - Remove wallet from role whitelist
export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, roleId, walletId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_workspace_roles')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('workspace_role_wallet_whitelist')
    .delete()
    .eq('role_id', roleId)
    .eq('wallet_id', walletId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error removing wallet from whitelist' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
