import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { pricingErrorStatus } from '@tuturuuu/inventory-core/period-pricing';
import { canCreateInventorySales } from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';

type Params = { params: Promise<{ wsId: string; requestId: string }> };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

/** Read only: absence is never proof an in-flight transaction cannot commit. */
export async function GET(request: Request, { params }: Params) {
  await connection();
  const { wsId, requestId } = await params;
  const auth = await authorizeInventoryWorkspace(request, wsId);
  if (!auth.ok) {
    auth.response.headers.set('Cache-Control', 'no-store');
    return auth.response;
  }
  if (!canCreateInventorySales(auth.value.permissions)) {
    return json({ message: 'Forbidden' }, 403);
  }
  if (!z.uuid().safeParse(requestId).success) {
    return json({ message: 'Invalid request ID' }, 400);
  }
  try {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .schema('private')
      .from('inventory_sale_price_snapshots' as never)
      .select('invoice_id')
      .eq('ws_id', auth.value.wsId)
      .eq('actor_id', auth.value.userId)
      .eq('request_id', requestId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ state: 'not_observed', request_id: requestId });
    const receipt = z.object({ invoice_id: z.uuid() }).safeParse(data);
    if (!receipt.success) return json({ message: 'Invalid receipt' }, 500);
    // Receipt/tombstone survives invoice deletion. Never create a replacement.
    return json({
      state: 'committed',
      request_id: requestId,
      invoice_id: receipt.data.invoice_id,
    });
  } catch (error) {
    return json(
      { message: 'Sale recovery is unavailable' },
      pricingErrorStatus(error)
    );
  }
}
