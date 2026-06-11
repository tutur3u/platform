import { NextResponse } from 'next/server';
import type { FinanceRouteAuthContext } from '../../request-access';
import { getAccessibleWallets, getWalletRouteContext } from '../wallet-access';
import {
  checkpointDatabaseErrorResponse,
  getLedgerBalanceAt,
  normalizeCheckpoint,
  normalizeSummaryWallet,
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

type CheckpointWalletContext = {
  normalizedWsId: string;
  permissions: {
    withoutPermission: (permission: 'manage_finance') => boolean;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbAdmin: any;
  userId: string;
};

async function listAccessibleCheckpointWallets(
  context: CheckpointWalletContext
) {
  const hasManageFinance =
    !context.permissions.withoutPermission('manage_finance');

  let walletIds: string[] | undefined;

  if (!hasManageFinance) {
    const { data: memberships, error: membershipsError } = await context.sbAdmin
      .from('workspace_role_members')
      .select('role_id, workspace_roles!inner(ws_id)')
      .eq('user_id', context.userId)
      .eq('workspace_roles.ws_id', context.normalizedWsId);

    if (membershipsError) {
      throw membershipsError;
    }

    const roleIds = ((memberships ?? []) as Array<{ role_id: string }>).map(
      (membership) => membership.role_id
    );

    if (roleIds.length === 0) {
      return [];
    }

    const { data: whitelistRows, error: whitelistError } = await context.sbAdmin
      .from('workspace_role_wallet_whitelist')
      .select('wallet_id')
      .in('role_id', roleIds);

    if (whitelistError) {
      throw whitelistError;
    }

    walletIds = [
      ...new Set(
        ((whitelistRows ?? []) as Array<{ wallet_id: string }>).map(
          (row) => row.wallet_id
        )
      ),
    ];

    if (walletIds.length === 0) {
      return [];
    }
  }

  let query = context.sbAdmin
    .schema('private')
    .from('workspace_wallets')
    .select('id,name,currency,balance,type,icon,image_src')
    .eq('ws_id', context.normalizedWsId);

  if (walletIds) {
    query = query.in('id', walletIds);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    normalizeSummaryWallet
  );
}

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
          await getLedgerBalanceAt({
            checkedAt: row.checked_at,
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
