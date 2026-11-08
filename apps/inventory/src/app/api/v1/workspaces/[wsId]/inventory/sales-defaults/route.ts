import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canEditInventorySalesDefaults } from '@tuturuuu/inventory-core/permissions';
import {
  INVENTORY_AUTO_SET_NEW_SALES_PERIOD_CONFIG_ID,
  serializeSalesPeriodAutoDefault,
} from '@tuturuuu/inventory-core/sales-period-default-policy';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SalesDefaultsSchema = z
  .object({
    autoSetNewSalesPeriodAsDefault: z.boolean().optional(),
    defaultFinanceCategoryId: z.uuid().nullable().optional(),
    defaultRevenueWalletId: z.uuid().nullable().optional(),
    defaultSalesPeriodId: z.uuid().nullable().optional(),
  })
  .refine(
    (payload) =>
      payload.autoSetNewSalesPeriodAsDefault !== undefined ||
      payload.defaultFinanceCategoryId !== undefined ||
      payload.defaultRevenueWalletId !== undefined ||
      payload.defaultSalesPeriodId !== undefined,
    { message: 'Choose at least one sales default' }
  );

const CONFIG_IDS = {
  defaultFinanceCategoryId: 'inventory_default_finance_category_id',
  defaultRevenueWalletId: 'inventory_default_revenue_wallet_id',
  defaultSalesPeriodId: 'inventory_default_sales_period_id',
} as const;

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (!canEditInventorySalesDefaults(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = SalesDefaultsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid sales defaults', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const sbAdmin = await createAdminClient();
    const {
      autoSetNewSalesPeriodAsDefault,
      defaultFinanceCategoryId,
      defaultRevenueWalletId,
      defaultSalesPeriodId,
    } = parsed.data;
    const [walletResult, categoryResult, periodResult] = await Promise.all([
      defaultRevenueWalletId
        ? sbAdmin
            .schema('private')
            .from('workspace_wallets')
            .select('id')
            .eq('id', defaultRevenueWalletId)
            .eq('ws_id', wsId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      defaultFinanceCategoryId
        ? sbAdmin
            .from('transaction_categories')
            .select('id')
            .eq('id', defaultFinanceCategoryId)
            .eq('ws_id', wsId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      defaultSalesPeriodId
        ? sbAdmin
            .schema('private')
            .from('inventory_sales_periods')
            .select('id')
            .eq('id', defaultSalesPeriodId)
            .eq('ws_id', wsId)
            .eq('status', 'active')
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (walletResult.error || categoryResult.error || periodResult.error) {
      throw walletResult.error ?? categoryResult.error ?? periodResult.error;
    }
    if (defaultRevenueWalletId && !walletResult.data) {
      return NextResponse.json(
        { message: 'Invalid revenue wallet' },
        { status: 400 }
      );
    }
    if (defaultFinanceCategoryId && !categoryResult.data) {
      return NextResponse.json(
        { message: 'Invalid finance category' },
        { status: 400 }
      );
    }
    if (defaultSalesPeriodId && !periodResult.data) {
      return NextResponse.json(
        { message: 'Invalid active sales period' },
        { status: 400 }
      );
    }

    const updatedAt = new Date().toISOString();
    const rows: Array<{
      id: string;
      updated_at: string;
      value: string;
      ws_id: string;
    }> = [];
    if (defaultFinanceCategoryId !== undefined) {
      rows.push({
        id: CONFIG_IDS.defaultFinanceCategoryId,
        updated_at: updatedAt,
        value: defaultFinanceCategoryId ?? '',
        ws_id: wsId,
      });
    }
    if (defaultRevenueWalletId !== undefined) {
      rows.push({
        id: CONFIG_IDS.defaultRevenueWalletId,
        updated_at: updatedAt,
        value: defaultRevenueWalletId ?? '',
        ws_id: wsId,
      });
    }
    if (defaultSalesPeriodId !== undefined) {
      rows.push({
        id: CONFIG_IDS.defaultSalesPeriodId,
        updated_at: updatedAt,
        value: defaultSalesPeriodId ?? '',
        ws_id: wsId,
      });
    }
    if (autoSetNewSalesPeriodAsDefault !== undefined) {
      rows.push({
        id: INVENTORY_AUTO_SET_NEW_SALES_PERIOD_CONFIG_ID,
        updated_at: updatedAt,
        value: serializeSalesPeriodAutoDefault(autoSetNewSalesPeriodAsDefault),
        ws_id: wsId,
      });
    }

    const { error } = await sbAdmin
      .from('workspace_configs')
      .upsert(rows, { onConflict: 'ws_id,id' });
    if (error) throw error;

    return NextResponse.json({ message: 'success' });
  } catch (error) {
    console.error('Failed to update inventory sales defaults', error);
    return NextResponse.json(
      { message: 'Failed to update inventory sales defaults' },
      { status: 500 }
    );
  }
}
