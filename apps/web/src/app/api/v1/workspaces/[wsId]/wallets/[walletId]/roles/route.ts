import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    walletId: string;
  }>;
}

// GET - List roles that have access to a wallet
export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, walletId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_workspace_roles')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('workspace_role_wallet_whitelist')
    .select(
      `
      id,
      role_id,
      viewing_window,
      custom_days,
      created_at,
      workspace_roles:role_id (
        id,
        name
      )
    `
    )
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching role access list' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

// POST - Add role access to wallet
export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, walletId } = await params;
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
  const { role_id, viewing_window, custom_days } = body;

  if (!role_id || !viewing_window) {
    return NextResponse.json(
      { message: 'role_id and viewing_window are required' },
      { status: 400 }
    );
  }

  // Validate wallet belongs to workspace
  const { data: wallet, error: walletError } = await supabase
    .from('workspace_wallets')
    .select('id, ws_id')
    .eq('id', walletId)
    .eq('ws_id', wsId)
    .single();

  if (walletError || !wallet) {
    return NextResponse.json(
      { message: 'Wallet not found or does not belong to workspace' },
      { status: 404 }
    );
  }

  // Validate role belongs to workspace
  const { data: role, error: roleError } = await supabase
    .from('workspace_roles')
    .select('id, ws_id')
    .eq('id', role_id)
    .eq('ws_id', wsId)
    .single();

  if (roleError || !role) {
    return NextResponse.json(
      { message: 'Role not found or does not belong to workspace' },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from('workspace_role_wallet_whitelist')
    .insert({
      role_id,
      wallet_id: walletId,
      viewing_window,
      custom_days: viewing_window === 'custom' ? custom_days : null,
    })
    .select()
    .single();

  if (error) {
    console.log(error);
    // Check if it's a unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { message: 'Role already has access to this wallet' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: 'Error adding role access' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
