import { NextResponse } from 'next/server';
import type { FinanceRouteAuthContext } from '../../../../request-access';
import {
  checkpointDatabaseErrorResponse,
  getLedgerBalanceAt,
  isCheckpointStorageMissing,
  normalizeCheckpoint,
  parseJsonBody,
  validationErrorResponse,
  WALLET_CHECKPOINT_SELECT,
} from '../../../checkpoints/helpers';
import {
  checkpointIdSchema,
  walletCheckpointUpdateSchema,
  walletIdSchema,
} from '../../../checkpoints/schema';
import type { WalletCheckpointRow } from '../../../checkpoints/types';
import { getAccessibleWallet } from '../../../wallet-access';

type Params = {
  params: Promise<{
    checkpointId: string;
    walletId: string;
    wsId: string;
  }>;
};

function validateRouteIds(walletId: string, checkpointId: string) {
  const walletIdResult = walletIdSchema.safeParse(walletId);
  if (!walletIdResult.success) {
    return NextResponse.json({ message: 'Invalid wallet ID' }, { status: 400 });
  }

  const checkpointIdResult = checkpointIdSchema.safeParse(checkpointId);
  if (!checkpointIdResult.success) {
    return NextResponse.json(
      { message: 'Invalid checkpoint ID' },
      { status: 400 }
    );
  }

  return null;
}

export async function PATCH(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { checkpointId, walletId, wsId } = await params;
  const idError = validateRouteIds(walletId, checkpointId);

  if (idError) {
    return idError;
  }

  const body = await parseJsonBody(req);
  if (body.response) {
    return body.response;
  }

  const payloadResult = walletCheckpointUpdateSchema.safeParse(body.data);
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

  const { data: existing, error: existingError } = await access.context.sbAdmin
    .schema('private')
    .from('workspace_wallet_checkpoints')
    .select(WALLET_CHECKPOINT_SELECT)
    .eq('id', checkpointId)
    .eq('wallet_id', walletId)
    .maybeSingle();

  if (existingError) {
    if (isCheckpointStorageMissing(existingError)) {
      return checkpointDatabaseErrorResponse(existingError);
    }

    return NextResponse.json(
      { message: 'Error fetching wallet checkpoint' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { message: 'Checkpoint not found' },
      { status: 404 }
    );
  }

  const existingRow = existing as WalletCheckpointRow;
  const checkedAt = payloadResult.data.checked_at ?? existingRow.checked_at;

  try {
    const ledgerBalance =
      payloadResult.data.checked_at !== undefined
        ? await getLedgerBalanceAt({
            checkedAt,
            sbAdmin: access.context.sbAdmin,
            walletId,
          })
        : existingRow.ledger_balance;

    const updatePayload = {
      ...(payloadResult.data.actual_balance !== undefined
        ? { actual_balance: payloadResult.data.actual_balance }
        : {}),
      ...(payloadResult.data.checked_at !== undefined
        ? { checked_at: checkedAt }
        : {}),
      ...(payloadResult.data.note !== undefined
        ? { note: payloadResult.data.note }
        : {}),
      currency: String(access.wallet.currency),
      ledger_balance: ledgerBalance,
    };

    const { data, error } = await access.context.sbAdmin
      .schema('private')
      .from('workspace_wallet_checkpoints')
      .update(updatePayload)
      .eq('id', checkpointId)
      .eq('wallet_id', walletId)
      .select(WALLET_CHECKPOINT_SELECT)
      .single();

    if (error) {
      return checkpointDatabaseErrorResponse(error);
    }

    return NextResponse.json(
      normalizeCheckpoint(data as WalletCheckpointRow, ledgerBalance)
    );
  } catch (error) {
    if (
      isCheckpointStorageMissing(error as { code?: string; message?: string })
    ) {
      return checkpointDatabaseErrorResponse(
        error as { code?: string; message?: string }
      );
    }

    return NextResponse.json(
      { message: 'Error calculating wallet checkpoint balances' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { checkpointId, walletId, wsId } = await params;
  const idError = validateRouteIds(walletId, checkpointId);

  if (idError) {
    return idError;
  }

  const access = await getAccessibleWallet({
    req,
    wsId,
    walletId,
    requiredPermission: 'update_wallets',
    select: 'id',
    authContext,
  });

  if (access.response) {
    return access.response;
  }

  const { data, error } = await access.context.sbAdmin
    .schema('private')
    .from('workspace_wallet_checkpoints')
    .delete()
    .eq('id', checkpointId)
    .eq('wallet_id', walletId)
    .select('id')
    .maybeSingle();

  if (error) {
    if (isCheckpointStorageMissing(error)) {
      return checkpointDatabaseErrorResponse(error);
    }

    return NextResponse.json(
      { message: 'Error deleting wallet checkpoint' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Checkpoint not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
