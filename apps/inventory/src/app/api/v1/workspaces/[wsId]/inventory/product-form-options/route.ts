import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canCreateInventorySales,
  canEditInventorySalesDefaults,
  canViewInventoryCatalog,
} from '@tuturuuu/inventory-core/permissions';
import { getInventoryProductFormOptions } from '@tuturuuu/inventory-core/product-rpc';
import {
  INVENTORY_AUTO_SET_NEW_SALES_PERIOD_CONFIG_ID,
  isSalesPeriodAutoDefaultEnabled,
} from '@tuturuuu/inventory-core/sales-period-default-policy';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (
    !canViewInventoryCatalog(permissions) &&
    !canCreateInventorySales(permissions)
  ) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const sbAdmin = await createAdminClient();
    const [
      data,
      walletsResult,
      defaultWalletId,
      defaultRevenueWalletId,
      defaultFinanceCategoryId,
      defaultSalesPeriodId,
      autoSetNewSalesPeriodAsDefault,
    ] = await Promise.all([
      getInventoryProductFormOptions({
        sbAdmin,
        wsId,
      }),
      sbAdmin
        .schema('private')
        .from('workspace_wallets')
        .select('id, name')
        .eq('ws_id', wsId)
        .order('name'),
      getWorkspaceConfig(wsId, 'default_wallet_id'),
      getWorkspaceConfig(wsId, 'inventory_default_revenue_wallet_id'),
      getWorkspaceConfig(wsId, 'inventory_default_finance_category_id'),
      getWorkspaceConfig(wsId, 'inventory_default_sales_period_id'),
      readSalesPeriodAutoDefault(sbAdmin, wsId),
    ]);

    if (walletsResult.error) throw walletsResult.error;

    return NextResponse.json({
      ...data,
      autoSetNewSalesPeriodAsDefault,
      canEditSalesDefaults: canEditInventorySalesDefaults(permissions),
      defaultFinanceCategoryId,
      defaultRevenueWalletId,
      defaultSalesPeriodId,
      defaultWalletId,
      wallets: walletsResult.data ?? [],
    });
  } catch (error) {
    console.error('Error fetching inventory product form options', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory product form options' },
      { status: 500 }
    );
  }
}

async function readSalesPeriodAutoDefault(
  sbAdmin: Awaited<ReturnType<typeof createAdminClient<Database>>>,
  wsId: string
): Promise<boolean | null> {
  try {
    const result = await sbAdmin
      .from('workspace_configs')
      .select('value')
      .eq('ws_id', wsId)
      .eq('id', INVENTORY_AUTO_SET_NEW_SALES_PERIOD_CONFIG_ID)
      .maybeSingle();
    if (result.error || !result.data) {
      return result.error ? null : false;
    }
    return isSalesPeriodAutoDefaultEnabled(result.data.value);
  } catch {
    return null;
  }
}
