import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { recordInventoryFinanceAdjustment } from '@tuturuuu/inventory-core/finance-reconciliation';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { privateFinanceDataClient } from '../private-client';

const payloadSchema = z.object({
  amountMinor: z
    .number()
    .int()
    .refine((value) => value !== 0),
  checkoutId: z.guid(),
  idempotencyKey: z.guid(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  reason: z.string().trim().min(3).max(1000),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const payload = payloadSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { message: 'Invalid manual adjustment' },
        { status: 400 }
      );
    }
    const { wsId } = await params;
    const access = await getFinanceRouteContext(
      request,
      wsId,
      await resolveFinanceRouteAuthContext(request)
    );
    if (access.response) return access.response;
    const { normalizedWsId, permissions, sbAdmin, user } = access.context;
    if (permissions.withoutPermission('manage_finance')) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }
    const { data: checkout, error } = await privateFinanceDataClient(sbAdmin)
      .from<{
        checkout_provider: string | null;
        id: string;
        polar_order_id: string | null;
        square_payment_id: string | null;
        ws_id: string;
      }>('inventory_checkout_sessions')
      .select('id, ws_id, checkout_provider, polar_order_id, square_payment_id')
      .eq('id', payload.data.checkoutId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();
    if (error) throw error;
    if (!checkout) {
      return NextResponse.json(
        { message: 'Checkout not found' },
        { status: 404 }
      );
    }
    const provider =
      checkout.checkout_provider === 'polar' ||
      checkout.checkout_provider === 'square_pos' ||
      checkout.checkout_provider === 'square_terminal'
        ? checkout.checkout_provider
        : checkout.polar_order_id
          ? 'polar'
          : checkout.square_payment_id
            ? 'square_terminal'
            : null;
    if (!provider) {
      return NextResponse.json(
        { message: 'Checkout has no supported provider' },
        { status: 400 }
      );
    }

    const result = await recordInventoryFinanceAdjustment({
      actorId: user.id,
      amountMinor: payload.data.amountMinor,
      checkoutId: checkout.id,
      kind: 'manual_provider_adjustment',
      metadata: {
        auditedBy: user.id,
        reason: payload.data.reason,
      },
      occurredAt: payload.data.occurredAt,
      provider,
      providerReferenceId: payload.data.idempotencyKey,
      providerStatus: 'manual',
      sourceKey: `manual:${payload.data.idempotencyKey}`,
    });
    if (!result.entryId || !result.status) {
      return NextResponse.json(
        { message: result.reason ?? 'Adjustment could not be recorded' },
        { status: 400 }
      );
    }
    return NextResponse.json({
      entryId: result.entryId,
      status: result.status,
      transactionId: result.transactionId ?? null,
    });
  } catch (error) {
    console.error('Inventory Finance manual adjustment failed', error);
    return NextResponse.json(
      { message: 'Failed to record manual adjustment' },
      { status: 500 }
    );
  }
}
