import {
  feeLockMonthSchema,
  feeLockSnapshotSchema,
  isFeeLockMoneyInRange,
} from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import { searchParamsToRecord } from '@tuturuuu/utils/search-params-record';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { feeLockErrorResponse, getFeeLockRouteContext } from '../access';

interface Params {
  params: Promise<{ wsId: string }>;
}

/** Invoice-form shape of a locked fee (design §2.2 "Mapping"). */
export interface FeeLockSuggestion {
  fee_lock_id: string;
  revision: number;
  period_month: string;
  currency: string;
  total_amount: number;
  /** Classes of the tuition lines (invoice `group_ids`). */
  group_ids: string[];
  /** Catalogue-priced lines: tuition (sessions) and catalogue extras. */
  products: Array<{
    product_id: string;
    unit_id: string;
    warehouse_id: string;
    quantity: number;
    group_id: string | null;
    label: string;
  }>;
  /** Lines that cannot become invoice products; staff add them by hand. */
  unmapped_lines: Array<{
    label: string;
    unit_label: string | null;
    quantity: number;
    unit_price: number;
    line_amount: number;
  }>;
  /** Locked total minus the unmapped lines: the invoice total override target. */
  override_total: number;
}

const querySchema = z.object({
  studentId: z.guid(),
  month: feeLockMonthSchema,
});
const catalogueRef = z.object({
  product_id: z.guid(),
  unit_id: z.guid(),
  warehouse_id: z.guid(),
});

/**
 * Pre-fill suggestion for a subscription invoice (create_invoices and
 * view_invoices): the student's LOCKED fee for the month, never a draft.
 * The student, month and lock are all read within the route workspace;
 * `{ suggestion: null }` when there is none.
 */
export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFeeLockRouteContext(request, rawWsId, [
    'create_invoices',
    'view_invoices',
  ]);
  if (access.response) return access.response;
  const { normalizedWsId: wsId, sbAdmin } = access.context;

  const query = querySchema.safeParse(
    searchParamsToRecord(new URL(request.url).searchParams)
  );
  if (!query.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters' },
      { status: 400 }
    );
  }

  const { data: lock, error } = await sbAdmin
    .from('fee_locks')
    .select('id, status, revision')
    .eq('ws_id', wsId)
    .eq('student_id', query.data.studentId)
    .eq('period_month', `${query.data.month}-01`)
    .maybeSingle();
  if (error) return feeLockErrorResponse(error);
  if (!lock || lock.status !== 'locked' || lock.revision < 1) {
    return NextResponse.json({ suggestion: null });
  }

  const { data: revision, error: revisionError } = await sbAdmin
    .from('fee_lock_revisions')
    .select('snapshot')
    .eq('ws_id', wsId)
    .eq('fee_lock_id', lock.id)
    .eq('revision', lock.revision)
    .maybeSingle();
  if (revisionError) return feeLockErrorResponse(revisionError);
  const snapshot = feeLockSnapshotSchema.safeParse(revision?.snapshot);
  if (!snapshot.success) {
    console.error('[fee-locks] unreadable snapshot', lock.id, lock.revision);
    return feeLockErrorResponse({ code: 'XX000' });
  }

  // feeLockSnapshotSchema strips unit and warehouse ids; read them from the raw lines.
  const rawLines = (revision?.snapshot as { lines?: unknown[] }).lines ?? [];
  const suggestion: FeeLockSuggestion = {
    fee_lock_id: lock.id,
    revision: snapshot.data.revision,
    period_month: snapshot.data.period_month,
    currency: snapshot.data.currency,
    total_amount: snapshot.data.total_amount,
    group_ids: [],
    products: [],
    unmapped_lines: [],
    override_total: snapshot.data.total_amount,
  };
  snapshot.data.lines.forEach((line, index) => {
    if (line.kind === 'tuition' && line.group_id) {
      suggestion.group_ids.push(line.group_id);
    }
    const ref = catalogueRef.safeParse(rawLines[index]);
    if (ref.success) {
      suggestion.products.push({
        ...ref.data,
        quantity: line.quantity,
        group_id: line.group_id,
        label: line.label,
      });
      return;
    }
    suggestion.unmapped_lines.push({
      label: line.label,
      unit_label: line.unit_label,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_amount: line.line_amount,
    });
    suggestion.override_total -= line.line_amount;
  });

  if (
    !isFeeLockMoneyInRange(suggestion.total_amount) ||
    !isFeeLockMoneyInRange(suggestion.override_total) ||
    suggestion.override_total < 0
  ) {
    return feeLockErrorResponse({ code: '22003' });
  }
  return NextResponse.json({ suggestion });
}
