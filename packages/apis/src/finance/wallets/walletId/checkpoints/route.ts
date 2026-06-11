import { NextResponse } from 'next/server';
import type { FinanceRouteAuthContext } from '../../../request-access';
import {
  checkpointDatabaseErrorResponse,
  getCheckpointLimit,
  getLedgerBalanceAt,
  listCheckpointIntervals,
  normalizeCheckpoint,
  parseJsonBody,
  validationErrorResponse,
  WALLET_CHECKPOINT_SELECT,
} from '../../checkpoints/helpers';
import {
  walletCheckpointCreateSchema,
  walletIdSchema,
} from '../../checkpoints/schema';
import type { WalletCheckpointRow } from '../../checkpoints/types';
import { getAccessibleWallet } from '../../wallet-access';

type Params = {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
};

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { walletId, wsId } = await params;
  const walletIdResult = walletIdSchema.safeParse(walletId);

  if (!walletIdResult.success) {
    return NextResponse.json({ message: 'Invalid wallet ID' }, { status: 400 });
  }

  const access = await getAccessibleWallet({
    req,
    wsId,
    walletId,
    requiredPermission: 'view_transactions',
    select: 'id,currency,balance',
    authContext,
  });

  if (access.response) {
    return access.response;
  }

  const limit = getCheckpointLimit(req);
  const { data, error } = await access.context.sbAdmin
    .schema('private')
    .from('workspace_wallet_checkpoints')
    .select(WALLET_CHECKPOINT_SELECT)
    .eq('wallet_id', walletId)
    .order('checked_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching wallet checkpoints' },
      { status: 500 }
    );
  }

  try {
    const checkpoints = await Promise.all(
      ((data ?? []) as WalletCheckpointRow[]).map(async (row) =>
        normalizeCheckpoint(
          row,
          await getLedgerBalanceAt({
            checkedAt: row.checked_at,
            sbAdmin: access.context.sbAdmin,
            walletId,
          })
        )
      )
    );
    const intervals = await listCheckpointIntervals({
      limit,
      sbAdmin: access.context.sbAdmin,
      walletId,
    });

    return NextResponse.json({
      data: checkpoints,
      intervals,
      latest: checkpoints[0] ?? null,
    });
  } catch {
    return NextResponse.json(
      { message: 'Error calculating wallet checkpoint balances' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { walletId, wsId } = await params;
  const walletIdResult = walletIdSchema.safeParse(walletId);

  if (!walletIdResult.success) {
    return NextResponse.json({ message: 'Invalid wallet ID' }, { status: 400 });
  }

  const body = await parseJsonBody(req);
  if (body.response) {
    return body.response;
  }

  const payloadResult = walletCheckpointCreateSchema.safeParse(body.data);
  if (!payloadResult.success) {
    return validationErrorResponse(payloadResult.error);
  }

  const access = await getAccessibleWallet({
    req,
    wsId,
    walletId,
    requiredPermission: 'update_wallets',
    select: 'id,currency',
    authContext,
  });

  if (access.response) {
    return access.response;
  }

  const checkedAt = payloadResult.data.checked_at ?? new Date().toISOString();

  try {
    const ledgerBalance = await getLedgerBalanceAt({
      checkedAt,
      sbAdmin: access.context.sbAdmin,
      walletId,
    });
    const { data, error } = await access.context.sbAdmin
      .schema('private')
      .from('workspace_wallet_checkpoints')
      .insert({
        actual_balance: payloadResult.data.actual_balance,
        checked_at: checkedAt,
        created_by: access.context.userId,
        currency: String(access.wallet.currency),
        ledger_balance: ledgerBalance,
        note: payloadResult.data.note,
        wallet_id: walletId,
      })
      .select(WALLET_CHECKPOINT_SELECT)
      .single();

    if (error) {
      return checkpointDatabaseErrorResponse(error);
    }

    return NextResponse.json(
      normalizeCheckpoint(data as WalletCheckpointRow, ledgerBalance),
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { message: 'Error calculating wallet checkpoint balances' },
      { status: 500 }
    );
  }
}
