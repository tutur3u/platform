import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  listPeriodPrices,
  periodPricingRpc,
  pricingErrorStatus,
} from '@tuturuuu/inventory-core/period-pricing';
import {
  canCreateInventorySales,
  canManageInventoryCatalog,
  canViewInventorySales,
} from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveSupportedCurrency } from '@tuturuuu/utils/currencies';
import { getCurrencyFractionDigits } from '@tuturuuu/utils/money';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';

type Params = { params: Promise<{ wsId: string; periodId: string }> };
const Payload = z
  .object({
    product_id: z.uuid(),
    unit_id: z.uuid(),
    warehouse_id: z.uuid(),
    price: z.number().finite().nonnegative(),
    starts_on: z.iso.date(),
    ends_on: z.iso.date().nullable().optional(),
  })
  .refine((value) => !value.ends_on || value.starts_on <= value.ends_on);

export async function GET(request: Request, { params }: Params) {
  await connection();
  const { wsId, periodId } = await params;
  const auth = await authorizeInventoryWorkspace(request, wsId);
  if (!auth.ok) return auth.response;
  if (
    !canViewInventorySales(auth.value.permissions) &&
    !canCreateInventorySales(auth.value.permissions)
  ) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  try {
    const data = await listPeriodPrices(
      await createAdminClient(),
      auth.value.wsId,
      periodId
    );
    return NextResponse.json(
      { data, as_of: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      { message: 'Season pricing is unavailable' },
      { status: pricingErrorStatus(error) }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const { wsId, periodId } = await params;
  const auth = await authorizeInventoryWorkspace(request, wsId);
  if (!auth.ok) return auth.response;
  if (!canManageInventoryCatalog(auth.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const parsed = Payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: 'Invalid price', errors: parsed.error.issues },
      { status: 400 }
    );
  const configuredCurrency = await getWorkspaceConfig(
    auth.value.wsId,
    'DEFAULT_CURRENCY'
  );
  const currency = resolveSupportedCurrency(configuredCurrency);
  if (!configuredCurrency || currency !== configuredCurrency.toUpperCase()) {
    return NextResponse.json(
      {
        message:
          'Configure a supported workspace currency before using season prices',
      },
      { status: 503 }
    );
  }
  const scale = 10 ** getCurrencyFractionDigits(currency);
  if (
    parsed.data.price * scale > Number.MAX_SAFE_INTEGER ||
    Math.abs(
      parsed.data.price * scale - Math.round(parsed.data.price * scale)
    ) > 0.000001
  ) {
    return NextResponse.json(
      { message: 'Price exceeds the currency precision' },
      { status: 400 }
    );
  }
  try {
    const { product_id, unit_id, warehouse_id, price, starts_on, ends_on } =
      parsed.data;
    const data = await periodPricingRpc(
      await createAdminClient(),
      'author_inventory_period_price',
      {
        p_ws_id: auth.value.wsId,
        p_period_id: periodId,
        p_actor_id: auth.value.userId,
        p_product_id: product_id,
        p_unit_id: unit_id,
        p_warehouse_id: warehouse_id,
        p_currency: currency,
        p_price: price,
        p_starts_on: starts_on,
        p_ends_on: ends_on ?? null,
      }
    );
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          'Price dates overlap, period is invalid, or pricing is unavailable',
      },
      { status: pricingErrorStatus(error) }
    );
  }
}
