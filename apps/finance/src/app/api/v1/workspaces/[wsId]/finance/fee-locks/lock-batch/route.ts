import {
  type FeeLockBatchItemResult,
  feeLockBatchLockRequestSchema,
} from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import { NextResponse } from 'next/server';
import {
  feeLockErrorResponse,
  getFeeLockRouteContext,
  invalidFeeLockBody,
  parseFeeLockBody,
} from '../access';

interface Params {
  params: Promise<{ wsId: string }>;
}

/**
 * "Chốt tất cả bản nháp" (create_invoices): locks up to 200 drafts of one
 * month, each in its own transaction. Ids outside this workspace or month are
 * `not_found`; a stale version, an already locked fee or an empty draft is
 * `conflict` with the current version so the UI reloads that row.
 */
export async function POST(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFeeLockRouteContext(request, rawWsId, [
    'create_invoices',
  ]);
  if (access.response) return access.response;
  const { normalizedWsId: wsId, sbAdmin, user } = access.context;

  const body = await parseFeeLockBody(request, feeLockBatchLockRequestSchema);
  if (!body) return invalidFeeLockBody();

  const ids = [...new Set(body.items.map((item) => item.id))];
  const { data: owned, error } = await sbAdmin
    .from('fee_locks')
    .select('id, version')
    .eq('ws_id', wsId)
    .eq('period_month', `${body.month}-01`)
    .in('id', ids);
  if (error) return feeLockErrorResponse(error);
  const versions = new Map((owned ?? []).map((row) => [row.id, row.version]));

  const results: FeeLockBatchItemResult[] = [];
  for (const item of body.items) {
    const knownVersion = versions.get(item.id);
    if (knownVersion === undefined) {
      results.push({ id: item.id, result: 'not_found' });
      continue;
    }
    const { data, error: lockError } = await sbAdmin
      .schema('private')
      .rpc('fee_lock_lock', {
        p_ws_id: wsId,
        p_actor_id: user.id,
        p_lock_id: item.id,
        p_expected_version: item.expected_version,
      });
    if (!lockError && data) {
      results.push({
        id: item.id,
        result: 'ok',
        version: data.version,
        revision: data.revision,
      });
    } else if (['PT409', '55000', '22023'].includes(lockError?.code ?? '')) {
      const detail = Number(lockError?.details);
      results.push({
        id: item.id,
        result: 'conflict',
        current_version:
          lockError?.code === 'PT409' && Number.isInteger(detail)
            ? detail
            : knownVersion,
      });
    } else if (lockError?.code === 'PT404') {
      results.push({ id: item.id, result: 'not_found' });
    } else {
      return feeLockErrorResponse(lockError);
    }
  }
  return NextResponse.json({ results });
}
