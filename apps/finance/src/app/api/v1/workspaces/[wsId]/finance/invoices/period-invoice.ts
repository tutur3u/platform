import {
  getPeriodPricingMode,
  periodPricingRpc,
  pricingErrorStatus,
} from '@tuturuuu/inventory-core/period-pricing';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { resolveSupportedCurrency } from '@tuturuuu/utils/currencies';
import { getCurrencyFractionDigits } from '@tuturuuu/utils/money';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export interface InvoiceProduct {
  product_id: string;
  unit_id: string;
  warehouse_id: string;
  quantity: number;
  price: number;
  category_id: string;
  price_id?: string;
}
export interface CreateInvoiceRequest {
  customer_id?: string | null;
  content: string;
  notes?: string;
  wallet_id: string;
  promotion_id?: string;
  products: InvoiceProduct[];
  category_id?: string;
  frontend_subtotal?: number;
  frontend_discount_amount?: number;
  frontend_total?: number;
  price_mode?: 'catalog' | 'custom';
  inventory_period_id?: string;
  inventory_request_id?: string;
}
const PeriodInvoice = z.object({
  inventory_period_id: z.uuid(),
  inventory_request_id: z.uuid(),
  content: z.string().trim().min(1).max(500),
  notes: z.string().max(2000).optional(),
  wallet_id: z.uuid(),
  category_id: z.uuid(),
  customer_id: z.uuid().nullable().optional(),
  products: z
    .array(
      z.object({
        product_id: z.uuid(),
        unit_id: z.uuid(),
        warehouse_id: z.uuid(),
        quantity: z
          .number()
          .finite()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER),
        price: z.number().finite().nonnegative(),
        price_id: z.uuid().optional(),
      })
    )
    .min(1)
    .max(500),
});

export async function createPeriodInvoice({
  sbAdmin,
  wsId,
  actorId,
  workspaceUserId,
  payload,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  actorId: string;
  workspaceUserId: string;
  payload: CreateInvoiceRequest;
}) {
  const parsed = PeriodInvoice.safeParse(payload);
  if (
    !parsed.success ||
    payload.price_mode !== 'custom' ||
    (payload.promotion_id && payload.promotion_id !== 'none')
  ) {
    return NextResponse.json(
      {
        message:
          'Invalid period sale; promotions are not supported for custom line prices',
      },
      { status: 400 }
    );
  }
  try {
    const scheduled =
      (await getPeriodPricingMode(
        sbAdmin,
        wsId,
        parsed.data.inventory_period_id
      )) === 'scheduled';
    const configuredCurrency = await getWorkspaceConfig(
      wsId,
      'DEFAULT_CURRENCY'
    );
    const currency = resolveSupportedCurrency(configuredCurrency);
    if (
      scheduled &&
      (!configuredCurrency || currency !== configuredCurrency.toUpperCase())
    ) {
      return NextResponse.json(
        {
          message:
            'Configure a supported workspace currency before using season prices',
        },
        { status: 503 }
      );
    }
    const scale = scheduled
      ? 10 ** getCurrencyFractionDigits(currency)
      : 1_000_000;
    if (
      scheduled &&
      parsed.data.products.some(
        ({ price }) =>
          Math.abs(price * scale - Math.round(price * scale)) > 0.000001
      )
    ) {
      return NextResponse.json(
        { message: 'Invalid currency precision' },
        { status: 400 }
      );
    }
    const totalMinor = parsed.data.products.reduce(
      (sum, row) => sum + Math.round(row.price * scale) * row.quantity,
      0
    );
    if (!Number.isSafeInteger(totalMinor)) {
      return NextResponse.json(
        { message: 'Sale amount exceeds supported precision' },
        { status: 400 }
      );
    }
    const invoiceId = await periodPricingRpc<string>(
      sbAdmin,
      'create_inventory_period_invoice',
      {
        p_ws_id: wsId,
        p_actor_id: actorId,
        p_workspace_user_id: workspaceUserId,
        p_period_id: parsed.data.inventory_period_id,
        p_request_id: parsed.data.inventory_request_id,
        p_currency: currency,
        p_invoice: parsed.data,
        p_products: parsed.data.products,
      }
    );
    return NextResponse.json({
      invoice_id: invoiceId,
      message: 'Invoice created successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Season, price or stock changed; refresh and review the cart',
      },
      { status: pricingErrorStatus(error) }
    );
  }
}
