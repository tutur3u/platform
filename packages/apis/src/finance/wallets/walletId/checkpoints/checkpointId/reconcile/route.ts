import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { FinanceRouteAuthContext } from '../../../../../request-access';
import {
  checkpointDatabaseErrorResponse,
  isCheckpointStorageMissing,
  parseJsonBody,
  toCheckpointNumber,
  validationErrorResponse,
} from '../../../../checkpoints/helpers';
import {
  checkpointIdSchema,
  walletIdSchema,
} from '../../../../checkpoints/schema';
import { getAccessibleWallet } from '../../../../wallet-access';

const reconcilePayloadSchema = z.object({
  basis: z.enum(['checkpoint', 'interval']).optional(),
  category_id: z.guid().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

type Params = {
  params: Promise<{
    checkpointId: string;
    walletId: string;
    wsId: string;
  }>;
};

type ReconciliationRow = {
  checked_at: string;
  checkpoint_id: string;
  created: boolean;
  offset_amount: number | string;
  transaction_id: string | null;
  wallet_id: string;
};

export async function POST(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { checkpointId, walletId, wsId } = await params;
  const checkpointIdResult = checkpointIdSchema.safeParse(checkpointId);
  const walletIdResult = walletIdSchema.safeParse(walletId);

  if (!checkpointIdResult.success || !walletIdResult.success) {
    return NextResponse.json(
      { message: 'Invalid checkpoint or wallet ID' },
      { status: 400 }
    );
  }

  const body = await parseJsonBody(req);
  if (body.response) {
    return body.response;
  }

  const payloadResult = reconcilePayloadSchema.safeParse(body.data);
  if (!payloadResult.success) {
    return validationErrorResponse(payloadResult.error);
  }

  const access = await getAccessibleWallet({
    req,
    wsId,
    walletId,
    requiredPermission: 'create_transactions',
    select: 'id',
    authContext,
  });

  if (access.response) {
    return access.response;
  }

  const { data, error } = await access.context.sbAdmin
    .schema('private')
    .rpc('create_wallet_checkpoint_reconciliation', {
      _actor_id: access.context.userId,
      _basis: payloadResult.data.basis ?? 'checkpoint',
      _category_id: payloadResult.data.category_id ?? null,
      _checkpoint_id: checkpointId,
      _description: payloadResult.data.description ?? null,
      _wallet_id: walletId,
    });

  if (error) {
    if (isCheckpointStorageMissing(error)) {
      return checkpointDatabaseErrorResponse(error);
    }

    return checkpointDatabaseErrorResponse(error);
  }

  const row = ((data ?? []) as ReconciliationRow[])[0];
  if (!row) {
    return NextResponse.json(
      { message: 'Error creating reconciliation transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    checked_at: row.checked_at,
    checkpoint_id: row.checkpoint_id,
    created: row.created,
    offset_amount: toCheckpointNumber(row.offset_amount),
    transaction_id: row.transaction_id,
    wallet_id: row.wallet_id,
  });
}
