import { createClient } from '@tuturuuu/supabase/next/server';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if user has manage_finance permission
  const hasManageFinance = !withoutPermission('manage_finance');

  if (hasManageFinance) {
    // User has full access - return all wallets
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
        { message: 'Error fetching transaction wallets' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  }

  // User doesn't have manage_finance - check wallet whitelist

  // Get user's role IDs
  const { data: userRoles, error: rolesError } = await supabase
    .from('workspace_role_members')
    .select('role_id')
    .eq('user_id', user.id);

  if (rolesError) {
    console.log(rolesError);
    return NextResponse.json(
      { message: 'Error fetching user roles' },
      { status: 500 }
    );
  }

  if (!userRoles || userRoles.length === 0) {
    return NextResponse.json([]);
  }

  const roleIds = userRoles.map((r) => r.role_id);

  // Get whitelisted wallet IDs and their viewing windows
  const { data: whitelistData, error: whitelistError } = await supabase
    .from('workspace_role_wallet_whitelist')
    .select('wallet_id, viewing_window, custom_days')
    .in('role_id', roleIds);

  if (whitelistError) {
    console.log(whitelistError);
    return NextResponse.json(
      { message: 'Error fetching whitelisted wallets' },
      { status: 500 }
    );
  }

  if (!whitelistData || whitelistData.length === 0) {
    return NextResponse.json([]);
  }

  // Get unique wallet IDs
  const walletIds = [...new Set(whitelistData.map((item) => item.wallet_id))];

  // Fetch wallet details
  const { data: wallets, error: walletsError } = await supabase
    .from('workspace_wallets')
    .select('*')
    .eq('ws_id', wsId)
    .in('id', walletIds)
    .order('name', { ascending: true });

  if (walletsError) {
    console.log(walletsError);
    return NextResponse.json(
      { message: 'Error fetching wallet details' },
      { status: 500 }
    );
  }

  // Add viewing window info to wallets
  const walletMap = new Map(
    whitelistData.map((item) => [
      item.wallet_id,
      { viewing_window: item.viewing_window, custom_days: item.custom_days },
    ])
  );

  const walletsWithWindow = (wallets || []).map((wallet) => ({
    ...wallet,
    viewing_window: walletMap.get(wallet.id)?.viewing_window,
    custom_days: walletMap.get(wallet.id)?.custom_days,
  }));

  return NextResponse.json(walletsWithWindow);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;
  const data: Wallet = await req.json();

  const { withoutPermission } = await getPermissions({
    wsId,
  });
  // TODO: Migrate to another permission
  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

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
