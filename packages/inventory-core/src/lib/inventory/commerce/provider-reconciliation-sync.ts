import 'server-only';

import type { InventoryPolarEnvironment } from '@tuturuuu/internal-api/inventory';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { decryptIntegrationToken, getIntegration } from './polar-core';
import { syncInventoryPolarOrder } from './polar-webhooks';
import { listSquareDisputesApi, listSquareRefundsApi } from './square/client';
import {
  decryptConnectionToken,
  getActiveConnection,
  refreshConnectionIfNeeded,
} from './square/connection-store';
import {
  syncInventorySquareDispute,
  syncInventorySquareRefund,
} from './square/reconciliation';
import type { SquareEnvironment } from './square/types';

type SquareSyncCursor = {
  disputes?: string | null;
  refunds?: string | null;
};

export type InventoryFinanceProviderSyncResult = {
  failed: number;
  nextCursor: string | null;
  processed: number;
  scanned: number;
};

function decodeSquareCursor(cursor?: string | null): SquareSyncCursor {
  if (!cursor) return {};
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as SquareSyncCursor;
    return {
      disputes: typeof parsed.disputes === 'string' ? parsed.disputes : null,
      refunds: typeof parsed.refunds === 'string' ? parsed.refunds : null,
    };
  } catch {
    throw new Error('Invalid Square reconciliation cursor');
  }
}

function encodeSquareCursor(cursor: SquareSyncCursor) {
  if (!cursor.disputes && !cursor.refunds) return null;
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

async function syncPolarHistory({
  cursor,
  environment,
  limit,
  wsId,
}: {
  cursor?: string | null;
  environment: InventoryPolarEnvironment;
  limit: number;
  wsId: string;
}): Promise<InventoryFinanceProviderSyncResult> {
  const integration = await getIntegration({ environment, wsId });
  if (!integration) throw new Error(`Polar ${environment} is not connected`);
  const accessToken = await decryptIntegrationToken(integration);
  const polar = createPolarClient({ accessToken, environment });
  const page = cursor ? Number.parseInt(cursor, 10) : 1;
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('Invalid Polar reconciliation cursor');
  }
  const response = await polar.orders.list({ limit, page });
  const orders = response.result?.items ?? [];
  let processed = 0;
  let failed = 0;

  for (const order of orders) {
    const metadata = order.metadata as Record<string, unknown> | null;
    if (
      metadata?.kind !== 'inventory_checkout' ||
      metadata.wsId !== wsId ||
      Number(order.refundedAmount) <= 0
    ) {
      continue;
    }
    try {
      await syncInventoryPolarOrder(order, wsId, {
        eventType: 'order.refunded',
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      console.error('Polar reconciliation order failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orderId: order.id,
        wsId,
      });
    }
  }

  return {
    failed,
    nextCursor: orders.length === limit ? String(page + 1) : null,
    processed,
    scanned: orders.length,
  };
}

async function syncSquareHistory({
  cursor,
  environment,
  limit,
  wsId,
}: {
  cursor?: string | null;
  environment: SquareEnvironment;
  limit: number;
  wsId: string;
}): Promise<InventoryFinanceProviderSyncResult> {
  const storedConnection = await getActiveConnection(wsId, environment);
  if (!storedConnection) {
    throw new Error(`Square ${environment} is not connected`);
  }
  const connection = await refreshConnectionIfNeeded(storedConnection);
  const accessToken = await decryptConnectionToken(connection);
  const decoded = decodeSquareCursor(cursor);
  const pageSize = Math.max(1, Math.floor(limit / 2));
  const [refundPage, disputePage] = await Promise.all([
    listSquareRefundsApi({
      accessToken,
      cursor: decoded.refunds,
      environment,
      limit: pageSize,
    }),
    listSquareDisputesApi({
      accessToken,
      cursor: decoded.disputes,
      environment,
      limit: pageSize,
    }),
  ]);
  let processed = 0;
  let failed = 0;

  for (const refund of refundPage.refunds ?? []) {
    try {
      if (
        await syncInventorySquareRefund(refund, {
          environment,
          wsId,
        })
      ) {
        processed += 1;
      }
    } catch (error) {
      failed += 1;
      console.error('Square refund reconciliation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        refundId: refund.id,
        wsId,
      });
    }
  }

  for (const dispute of disputePage.disputes ?? []) {
    try {
      if (
        await syncInventorySquareDispute(dispute, {
          environment,
          wsId,
        })
      ) {
        processed += 1;
      }
    } catch (error) {
      failed += 1;
      console.error('Square dispute reconciliation failed', {
        disputeId: dispute.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        wsId,
      });
    }
  }

  return {
    failed,
    nextCursor: encodeSquareCursor({
      disputes: disputePage.cursor ?? null,
      refunds: refundPage.cursor ?? null,
    }),
    processed,
    scanned:
      (refundPage.refunds?.length ?? 0) + (disputePage.disputes?.length ?? 0),
  };
}

export async function syncInventoryFinanceProviderHistory({
  cursor,
  environment,
  limit = 100,
  provider,
  wsId,
}: {
  cursor?: string | null;
  environment: 'production' | 'sandbox';
  limit?: number;
  provider: 'polar' | 'square_pos' | 'square_terminal';
  wsId: string;
}) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  if (provider === 'polar') {
    return syncPolarHistory({
      cursor,
      environment,
      limit: boundedLimit,
      wsId,
    });
  }
  return syncSquareHistory({
    cursor,
    environment,
    limit: boundedLimit,
    wsId,
  });
}
