import { canSetAnyFinanceWalletOnCreate } from '@tuturuuu/utils/finance';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  type FinanceRouteAuthContext,
  getFinanceRouteContext,
} from '../request-access';
import { attachWalletAuditData } from './audit-balance';
import {
  attachWalletCreditData,
  flattenWalletCreditList,
  selectIncludesWalletCreditData,
  stripWalletCreditSelect,
} from './wallet-access';
import { parseWalletPayload } from './wallet-payload';

const FULL_WALLET_SELECT =
  '*, credit_wallets(limit, statement_date, payment_date)';
const INVOICE_SAFE_WALLET_SELECT = 'id,name,type,currency,icon,image_src';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

async function loadWorkspaceWallets({
  invoiceSafeOnly,
  normalizedWsId,
  sbAdmin,
  walletIds,
}: {
  invoiceSafeOnly: boolean;
  normalizedWsId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbAdmin: any;
  walletIds?: string[];
}) {
  const select = invoiceSafeOnly
    ? INVOICE_SAFE_WALLET_SELECT
    : FULL_WALLET_SELECT;
  const shouldAttachCreditData = selectIncludesWalletCreditData(select);

  let query = sbAdmin
    .schema('private')
    .from('workspace_wallets')
    .select(stripWalletCreditSelect(select))
    .eq('ws_id', normalizedWsId);

  if (walletIds) {
    query = query.in('id', walletIds);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) {
    return {
      data: data ?? [],
      error,
    };
  }

  if (!shouldAttachCreditData) {
    if (invoiceSafeOnly) {
      return {
        data: data ?? [],
        error: null,
      };
    }

    return attachWalletAuditData(
      sbAdmin,
      (data ?? []) as Array<Record<string, unknown>>
    );
  }

  const creditResult = await attachWalletCreditData(sbAdmin, data ?? []);

  if (creditResult.error || invoiceSafeOnly) {
    return {
      data: flattenWalletCreditList(creditResult.data),
      error: creditResult.error,
    };
  }

  return attachWalletAuditData(
    sbAdmin,
    flattenWalletCreditList(creditResult.data)
  );
}

export async function GET(
  request: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(request, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin, user } = access.context;
  const { withoutPermission } = permissions;

  // Check if user has manage_finance permission
  const hasManageFinance = !withoutPermission('manage_finance');
  const hasCreateInvoices = !withoutPermission('create_invoices');
  const canReadWalletFinancialFields =
    hasManageFinance || !withoutPermission('view_transactions');
  const defaultInvoiceWalletId = hasCreateInvoices
    ? await getWorkspaceConfig(normalizedWsId, 'default_wallet_id')
    : null;
  const canReadAllWalletsForInvoiceCreation =
    hasCreateInvoices &&
    (!defaultInvoiceWalletId || canSetAnyFinanceWalletOnCreate(permissions));

  if (hasManageFinance) {
    const { data, error } = await loadWorkspaceWallets({
      invoiceSafeOnly: false,
      normalizedWsId,
      sbAdmin,
    });

    if (error) {
      console.log(error);
      return NextResponse.json(
        { message: 'Error fetching transaction wallets' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  }

  if (canReadAllWalletsForInvoiceCreation) {
    // Invoice creators need wallet choices when there is no default wallet or
    // their role can override the default during creation.
    const { data, error } = await loadWorkspaceWallets({
      invoiceSafeOnly: true,
      normalizedWsId,
      sbAdmin,
    });

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
  const defaultInvoiceWalletIds = defaultInvoiceWalletId
    ? [defaultInvoiceWalletId]
    : [];

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
    if (defaultInvoiceWalletIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data: wallets, error: walletsError } = await loadWorkspaceWallets({
      invoiceSafeOnly: !canReadWalletFinancialFields,
      normalizedWsId,
      sbAdmin,
      walletIds: defaultInvoiceWalletIds,
    });

    if (walletsError) {
      console.log(walletsError);
      return NextResponse.json(
        { message: 'Error fetching wallet details' },
        { status: 500 }
      );
    }

    return NextResponse.json(flattenWalletCreditList(wallets ?? []));
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

  if (
    (!whitelistData || whitelistData.length === 0) &&
    defaultInvoiceWalletIds.length === 0
  ) {
    return NextResponse.json([]);
  }

  // Get unique wallet IDs
  const walletIds = [
    ...new Set([
      ...(whitelistData ?? []).map((item) => item.wallet_id),
      ...defaultInvoiceWalletIds,
    ]),
  ];

  // Fetch wallet details
  const { data: wallets, error: walletsError } = await loadWorkspaceWallets({
    invoiceSafeOnly: !canReadWalletFinancialFields,
    normalizedWsId,
    sbAdmin,
    walletIds,
  });

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

  const walletMap = (whitelistData ?? []).reduce((acc, item) => {
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

  const walletRows = (wallets ?? []) as Array<
    { id: string } & Record<string, unknown>
  >;
  const walletsWithWindow = canReadWalletFinancialFields
    ? walletRows.map((wallet) => ({
        ...wallet,
        viewing_window: walletMap.get(wallet.id)?.viewing_window,
        custom_days: walletMap.get(wallet.id)?.custom_days,
      }))
    : walletRows;

  return NextResponse.json(walletsWithWindow);
}

export async function POST(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const parsed = await parseWalletPayload(req);

  if (parsed.response) {
    return parsed.response;
  }

  const data = parsed.data;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;
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
    .schema('private')
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
    const { limit, payment_date, statement_date } = data;

    if (
      limit === undefined ||
      payment_date === undefined ||
      statement_date === undefined
    ) {
      return NextResponse.json(
        { message: 'Invalid wallet data' },
        { status: 400 }
      );
    }

    const { error: creditError } = await sbAdmin.from('credit_wallets').upsert({
      wallet_id: upsertedWallet.id,
      statement_date,
      payment_date,
      limit,
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
