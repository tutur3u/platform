import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { privateFinanceDataClient } from '../private-client';

const payloadSchema = z.object({
  entryIds: z.array(z.guid()).min(1).max(100),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const payload = payloadSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { message: 'Select between 1 and 100 valid entries' },
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

    const { data, error } = await privateFinanceDataClient(sbAdmin).rpc<{
      entry_id: string;
      reconciliation_status: string;
      wallet_transaction_id: string | null;
    }>('bulk_unlink_inventory_finance_entries', {
      p_actor_id: user.id,
      p_entry_ids: payload.data.entryIds,
      p_ws_id: normalizedWsId,
    });
    if (error) throw error;
    const entries = (data ?? []).map((entry) => ({
      entryId: entry.entry_id,
      status: entry.reconciliation_status,
      transactionId: entry.wallet_transaction_id,
    }));
    return NextResponse.json({ count: entries.length, entries });
  } catch (error) {
    console.error('Inventory Finance bulk unlink failed', error);
    return NextResponse.json(
      { message: 'Failed to unlink reconciliation entries' },
      { status: 500 }
    );
  }
}
