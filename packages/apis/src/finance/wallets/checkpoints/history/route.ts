import { NextResponse } from 'next/server';
import type { FinanceRouteAuthContext } from '../../../request-access';
import { getWalletRouteContext } from '../../wallet-access';
import { listAccessibleCheckpointWallets } from '../access';
import {
  getCheckpointLimit,
  getLedgerBalanceForCheckpointRead,
  isCheckpointStorageMissing,
  listCheckpointIntervals,
  listWalletAuditStatuses,
  normalizeCheckpoint,
  summarizeCheckpointTotals,
  WALLET_CHECKPOINT_SELECT,
} from '../helpers';
import type {
  WalletCheckpointHistoryInterval,
  WalletCheckpointRow,
} from '../types';

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
    const limit = getCheckpointLimit(req);
    const wallets = await listAccessibleCheckpointWallets(access.context);
    const walletIds = wallets.map((wallet) => wallet.id);

    if (walletIds.length === 0) {
      return NextResponse.json({
        audit_statuses: [],
        checkpoints: [],
        intervals: [],
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
      .order('created_at', { ascending: false })
      .limit(limit * walletIds.length);

    if (error) {
      if (isCheckpointStorageMissing(error)) {
        return NextResponse.json({
          audit_statuses: [],
          checkpoints: [],
          intervals: [],
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

    const checkpointRows = (data ?? []) as WalletCheckpointRow[];
    const checkpoints = await Promise.all(
      checkpointRows.map(async (row) =>
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

    const latestRows = new Map<string, WalletCheckpointRow>();
    for (const row of checkpointRows) {
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

    const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
    const intervalGroups = await Promise.all(
      walletIds.map(async (walletId) => {
        const wallet = walletById.get(walletId);
        const intervals = await listCheckpointIntervals({
          limit,
          sbAdmin: access.context.sbAdmin,
          walletId,
        });

        return intervals.map(
          (interval) =>
            ({
              ...interval,
              currency: wallet?.currency ?? 'USD',
              wallet_id: walletId,
              wallet_name: wallet?.name ?? null,
            }) satisfies WalletCheckpointHistoryInterval
        );
      })
    );

    const auditStatuses = await listWalletAuditStatuses({
      sbAdmin: access.context.sbAdmin,
      walletIds,
    });

    return NextResponse.json({
      audit_statuses: auditStatuses,
      checkpoints,
      intervals: intervalGroups
        .flat()
        .sort((a, b) => b.end_checked_at.localeCompare(a.end_checked_at)),
      latest_checkpoints: latestCheckpoints,
      totals_by_currency: summarizeCheckpointTotals(latestCheckpoints),
      wallets,
    });
  } catch (error) {
    if (
      isCheckpointStorageMissing(error as { code?: string; message?: string })
    ) {
      return NextResponse.json({
        audit_statuses: [],
        checkpoints: [],
        intervals: [],
        latest_checkpoints: [],
        totals_by_currency: [],
        wallets: [],
      });
    }

    return NextResponse.json(
      { message: 'Error fetching wallet checkpoint history' },
      { status: 500 }
    );
  }
}
