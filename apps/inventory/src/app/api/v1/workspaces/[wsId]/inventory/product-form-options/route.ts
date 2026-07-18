import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canCreateInventorySales,
  canViewInventoryCatalog,
} from '@tuturuuu/inventory-core/permissions';
import { getInventoryProductFormOptions } from '@tuturuuu/inventory-core/product-rpc';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
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
    ]);

    if (walletsResult.error) throw walletsResult.error;

    return NextResponse.json({
      ...data,
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
