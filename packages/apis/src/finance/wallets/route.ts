import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { flattenWalletCreditList } from './wallet-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId } = await params;
  let normalizedWsId: string;

  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  } catch {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const permissions = await getPermissions({
    wsId,
    request,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient();

  // Check if user has manage_finance permission
  const hasManageFinance = !withoutPermission('manage_finance');

  if (hasManageFinance) {
    // User has full access - return all wallets
    const { data, error } = await sbAdmin
      .from('workspace_wallets')
      .select('*, credit_wallets(limit, statement_date, payment_date)')
      .eq('ws_id', normalizedWsId)
      .order('name', { ascending: true });

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error fetching transaction wallets' },
        { status: 500 }
      );
    }

    return NextResponse.json(flattenWalletCreditList(data ?? []));
  }

  // User doesn't have manage_finance - check wallet whitelist

  // Get user's role IDs
  const { data: userRoles, error: rolesError } = await sbAdmin
    .from('workspace_role_members')
    .select('role_id, workspace_roles!inner(ws_id)')
    .eq('user_id', user.id)
    .eq('workspace_roles.ws_id', normalizedWsId);

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
  const { data: whitelistData, error: whitelistError } = await sbAdmin
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
  const { data: wallets, error: walletsError } = await sbAdmin
    .from('workspace_wallets')
    .select('*, credit_wallets(limit, statement_date, payment_date)')
    .eq('ws_id', normalizedWsId)
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
  const getViewingWindowDays = (
    window: string | null,
    customDays: number | null
  ): number => {
    if (!window) return 30;
    switch (window) {
      case '1_day':
        return 1;
      case '3_days':
        return 3;
      case '7_days':
        return 7;
      case '2_weeks':
        return 14;
      case '1_month':
        return 30;
      case '1_quarter':
        return 90;
      case '1_year':
        return 365;
      case 'custom':
        return customDays && customDays >= 1 ? customDays : 30;
      default:
        return 30;
    }
  };

  const walletMap = whitelistData.reduce((acc, item) => {
    const existing = acc.get(item.wallet_id);
    if (!existing) {
      acc.set(item.wallet_id, {
        viewing_window: item.viewing_window,
        custom_days: item.custom_days,
      });
    } else {
      const existingDays = getViewingWindowDays(
        existing.viewing_window,
        existing.custom_days
      );
      const currentDays = getViewingWindowDays(
        item.viewing_window,
        item.custom_days
      );

      if (currentDays > existingDays) {
        acc.set(item.wallet_id, {
          viewing_window: item.viewing_window,
          custom_days: item.custom_days,
        });
      }
    }
    return acc;
  }, new Map<
    string,
    { viewing_window: string | null; custom_days: number | null }
  >());

  const walletsWithWindow = flattenWalletCreditList(wallets ?? []).map(
    (wallet) => ({
      ...wallet,
      viewing_window: walletMap.get(wallet.id)?.viewing_window,
      custom_days: walletMap.get(wallet.id)?.custom_days,
    })
  );

  return NextResponse.json(walletsWithWindow);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const { wsId } = await params;
  const data: Wallet = await req.json();
  let normalizedWsId: string;

  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  } catch {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const permissions = await getPermissions({
    wsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('create_wallets')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Extract only fields that exist in the database schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletData: { ws_id: string } & Record<string, any> = {
    ws_id: normalizedWsId,
  };
  if (data.id) walletData.id = data.id;
  if (data.name) walletData.name = data.name;
  if (data.balance !== undefined) walletData.balance = data.balance;
  if (data.currency) walletData.currency = data.currency;
  if (data.description !== undefined) walletData.description = data.description;
  if (data.icon !== undefined) walletData.icon = data.icon;
  if (data.image_src !== undefined) walletData.image_src = data.image_src;
  if (data.report_opt_in !== undefined)
    walletData.report_opt_in = data.report_opt_in;
  if (data.type) walletData.type = data.type;

  const { data: upsertedWallet, error } = await sbAdmin
    .from('workspace_wallets')
    .upsert([walletData as never])
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace wallets' },
      { status: 500 }
    );
  }

  // Handle credit wallet data
  if (data.type === 'CREDIT' && upsertedWallet) {
    const { error: creditError } = await sbAdmin.from('credit_wallets').upsert({
      wallet_id: upsertedWallet.id,
      statement_date: data.statement_date ?? 1,
      payment_date: data.payment_date ?? 1,
      limit: data.limit ?? 0,
    });

    if (creditError) {
      console.log(creditError);
      return NextResponse.json(
        { message: 'Error creating credit wallet data' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: 'success' });
}
