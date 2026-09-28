import { NextResponse } from 'next/server';
import type { z } from 'zod';
import type { FinanceRouteContext } from '../request-access';
import type { TransferSchema } from './schemas';

export async function checkTransferReplay({
  context,
  data,
}: {
  context: FinanceRouteContext;
  data: z.infer<typeof TransferSchema>;
}): Promise<NextResponse | null> {
  const { sbAdmin, user } = context;
  if (
    data.client_origin_transaction_id &&
    data.client_destination_transaction_id
  ) {
    const { data: existing, error: replayError } = await sbAdmin
      .from('wallet_transactions')
      .select('id, wallet_id, platform_creator_id')
      .in('id', [
        data.client_origin_transaction_id,
        data.client_destination_transaction_id,
      ]);
    if (replayError) {
      return NextResponse.json(
        { message: 'Error checking transfer replay' },
        { status: 500 }
      );
    }
    if (existing?.length) {
      const validPair =
        existing.length === 2 &&
        existing.some(
          (row) =>
            row.id === data.client_origin_transaction_id &&
            row.wallet_id === data.origin_wallet_id &&
            row.platform_creator_id === user.id
        ) &&
        existing.some(
          (row) =>
            row.id === data.client_destination_transaction_id &&
            row.wallet_id === data.destination_wallet_id &&
            row.platform_creator_id === user.id
        );
      if (validPair) {
        const { data: link, error: linkError } = await sbAdmin
          .from('workspace_wallet_transfers')
          .select('from_transaction_id')
          .eq('from_transaction_id', data.client_origin_transaction_id)
          .eq('to_transaction_id', data.client_destination_transaction_id)
          .maybeSingle();
        if (linkError) {
          return NextResponse.json(
            { message: 'Error checking transfer link' },
            { status: 500 }
          );
        }
        if (link) {
          return NextResponse.json({
            from_transaction_id: data.client_origin_transaction_id,
            to_transaction_id: data.client_destination_transaction_id,
          });
        }
      }
      return NextResponse.json(
        { message: 'Transfer requires reconciliation' },
        { status: 409 }
      );
    }
  }

  return null;
}
