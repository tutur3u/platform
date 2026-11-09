import { feeLockLockRequestSchema } from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  feeLockErrorResponse,
  feeLockWriteErrorResponse,
  getFeeLockRouteContext,
  invalidFeeLockBody,
  parseFeeLockBody,
} from '../../access';

interface Params {
  params: Promise<{ wsId: string; lockId: string }>;
}

/** Lock a draft (create_invoices): revision + 1 and an immutable snapshot. */
export async function POST(request: Request, { params }: Params) {
  const { wsId: rawWsId, lockId } = await params;
  const access = await getFeeLockRouteContext(request, rawWsId, [
    'create_invoices',
  ]);
  if (access.response) return access.response;
  const { normalizedWsId: wsId, sbAdmin, user } = access.context;

  if (!z.guid().safeParse(lockId).success) {
    return feeLockErrorResponse({ code: 'PT404' });
  }
  const body = await parseFeeLockBody(request, feeLockLockRequestSchema);
  if (!body) return invalidFeeLockBody();

  // The function only finds the lock within this workspace (PT404 otherwise).
  const { data, error } = await sbAdmin.schema('private').rpc('fee_lock_lock', {
    p_ws_id: wsId,
    p_actor_id: user.id,
    p_lock_id: lockId,
    p_expected_version: body.expected_version,
  });
  if (error) {
    return feeLockWriteErrorResponse(sbAdmin, wsId, error, { id: lockId });
  }
  return NextResponse.json(data);
}
