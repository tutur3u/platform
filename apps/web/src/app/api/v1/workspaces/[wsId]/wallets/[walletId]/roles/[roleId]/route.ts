import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    walletId: string;
    roleId: string;
  }>;
}

// PUT - Update role's viewing window for a wallet
export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, walletId, roleId } = await params;
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
    .eq('wallet_id', walletId)
    .eq('role_id', roleId)
    .select()
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating role access' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

// DELETE - Remove role's access to wallet
export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, walletId, roleId } = await params;
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
    .eq('wallet_id', walletId)
    .eq('role_id', roleId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error removing role access' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
