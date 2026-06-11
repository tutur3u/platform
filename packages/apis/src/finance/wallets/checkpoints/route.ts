import { NextResponse } from 'next/server';
import type { FinanceRouteAuthContext } from '../../request-access';
import { getAccessibleWallets, getWalletRouteContext } from '../wallet-access';
import { listAccessibleCheckpointWallets } from './access';
import {
  checkpointDatabaseErrorResponse,
  getLedgerBalanceForCheckpointRead,
  isCheckpointStorageMissing,
  normalizeCheckpoint,
  parseJsonBody,
  summarizeCheckpointTotals,
  validationErrorResponse,
  WALLET_CHECKPOINT_SELECT,
} from './helpers';
import { walletCheckpointBatchCreateSchema } from './schema';
import type { WalletCheckpointRow } from './types';

type Params = {
  params: Promise<{
    wsId: string;
  }>;
};

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const access = await getWalletRouteContext(
    req,
    wsId,
    'view_transactions',
    authContext
  );

  if (access.response) {
    return access.response;
  }

  try {
    const wallets = await listAccessibleCheckpointWallets(access.context);
    const walletIds = wallets.map((wallet) => wallet.id);

    if (walletIds.length === 0) {
      return NextResponse.json({
        latest_checkpoints: [],
        totals_by_currency: [],
        wallets: [],
      });
    }

    const { data, error } = await access.context.sbAdmin
      .schema('private')
      .from('workspace_wallet_checkpoints')
      .select(WALLET_CHECKPOINT_SELECT)
      .in('wallet_id', walletIds)
      .order('checked_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (isCheckpointStorageMissing(error)) {
        return NextResponse.json({
          latest_checkpoints: [],
          totals_by_currency: [],
          wallets,
        });
      }

      return NextResponse.json(
        { message: 'Error fetching wallet checkpoints' },
        { status: 500 }
      );
    }

    const latestRows = new Map<string, WalletCheckpointRow>();
    for (const row of (data ?? []) as WalletCheckpointRow[]) {
      if (!latestRows.has(row.wallet_id)) {
        latestRows.set(row.wallet_id, row);
      }
    }

    const latestCheckpoints = await Promise.all(
      [...latestRows.values()].map(async (row) =>
        normalizeCheckpoint(
          row,
          await getLedgerBalanceForCheckpointRead({
            checkedAt: row.checked_at,
            fallbackLedgerBalance: row.ledger_balance,
            sbAdmin: access.context.sbAdmin,
            walletId: row.wallet_id,
          })
        )
      )
    );

    return NextResponse.json({
      latest_checkpoints: latestCheckpoints,
      totals_by_currency: summarizeCheckpointTotals(latestCheckpoints),
      wallets,
    });
  } catch {
    return NextResponse.json(
      { message: 'Error fetching wallet checkpoint summary' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const body = await parseJsonBody(req);

  if (body.response) {
    return body.response;
  }

  const payloadResult = walletCheckpointBatchCreateSchema.safeParse(body.data);
  if (!payloadResult.success) {
    return validationErrorResponse(payloadResult.error);
  }

  const payload = payloadResult.data;
  const walletIds = payload.entries.map((entry) => entry.wallet_id);
  const uniqueWalletIds = [...new Set(walletIds)];

  if (uniqueWalletIds.length !== walletIds.length) {
    return NextResponse.json(
      { message: 'Duplicate wallet checkpoint entries are not allowed' },
      { status: 400 }
    );
  }

  const access = await getAccessibleWallets({
    req,
    wsId,
    walletIds,
    requiredPermission: 'update_wallets',
    select: 'id,currency',
    authContext,
  });

  if (access.response) {
    return access.response;
  }

  if (access.wallets.length !== walletIds.length) {
    return NextResponse.json({ message: 'Wallet not found' }, { status: 404 });
  }

  const checkedAt = payload.checked_at ?? new Date().toISOString();
  const { data, error } = await access.context.sbAdmin
    .schema('private')
    .rpc('create_workspace_wallet_checkpoints_batch', {
      _actor_id: access.context.userId,
      _checked_at: checkedAt,
      _entries: payload.entries,
      _ws_id: access.context.normalizedWsId,
    });

  if (error) {
    return checkpointDatabaseErrorResponse(error);
  }

  const checkpoints = ((data ?? []) as WalletCheckpointRow[]).map((row) =>
    normalizeCheckpoint(row, row.ledger_balance)
  );

  return NextResponse.json(
    {
      data: checkpoints,
      totals_by_currency: summarizeCheckpointTotals(checkpoints),
    },
    { status: 201 }
  );
}
