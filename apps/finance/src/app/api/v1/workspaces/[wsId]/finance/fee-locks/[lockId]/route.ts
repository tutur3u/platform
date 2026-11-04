import type { FeeLockDetail } from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { feeLockErrorResponse, getFeeLockRouteContext } from '../access';

interface Params {
  params: Promise<{ wsId: string; lockId: string }>;
}

const notFound = () =>
  NextResponse.json({ message: 'Not found' }, { status: 404 });

/** One fee lock of the workspace: header, lines and locked revisions. */
export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId, lockId } = await params;
  const access = await getFeeLockRouteContext(request, rawWsId, [
    'view_invoices',
  ]);
  if (access.response) return access.response;
  const { normalizedWsId: wsId, sbAdmin } = access.context;

  if (!z.guid().safeParse(lockId).success) return notFound();

  const { data: lock, error } = await sbAdmin
    .from('fee_locks')
    .select('*')
    .eq('id', lockId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) return feeLockErrorResponse(error);
  if (!lock) return notFound();

  const [lines, revisions] = await Promise.all([
    sbAdmin
      .from('fee_lock_lines')
      .select(
        'id, kind, group_id, group_name_snapshot, label, unit_label, product_id, unit_id, warehouse_id, baseline_quantity, baseline_amount, unit_price, quantity, adjustment_amount, reason, line_amount, sort_order'
      )
      .eq('fee_lock_id', lock.id)
      .eq('ws_id', wsId)
      .order('sort_order')
      .order('id'),
    sbAdmin
      .from('fee_lock_revisions')
      .select('revision, total_amount, locked_by, locked_at')
      .eq('fee_lock_id', lock.id)
      .eq('ws_id', wsId)
      .order('revision', { ascending: false }),
  ]);
  if (lines.error) return feeLockErrorResponse(lines.error);
  if (revisions.error) return feeLockErrorResponse(revisions.error);

  const body = {
    lock,
    lines: lines.data ?? [],
    revisions: revisions.data ?? [],
  } as FeeLockDetail;
  return NextResponse.json(body);
}
