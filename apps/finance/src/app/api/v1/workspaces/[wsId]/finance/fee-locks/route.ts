import {
  type FeeLockListResponse,
  type FeeLockListRow,
  feeLockListQuerySchema,
  feeLockSaveDraftRequestSchema,
  isFeeLockMoneyInRange,
} from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import type { Json } from '@tuturuuu/types';
import { searchParamsToRecord } from '@tuturuuu/utils/search-params-record';
import { NextResponse } from 'next/server';
import {
  feeLockErrorResponse,
  feeLockWriteErrorResponse,
  getFeeLockCurrency,
  getFeeLockRouteContext,
  invalidFeeLockBody,
  parseFeeLockBody,
} from './access';
import { readAllInChunks, readAllPages } from './read-pages';

interface Params {
  params: Promise<{ wsId: string }>;
}

/** Lower-case, accent-free text so "Nguyễn" matches "nguyen". */
export function foldFeeLockSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * Month view: every student with an active enrolment in the month (from
 * private.fee_lock_baseline) plus every student who already has a fee lock
 * for it, with the expected tuition per class and the lock state.
 */
export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFeeLockRouteContext(request, rawWsId, [
    'view_invoices',
  ]);
  if (access.response) return access.response;
  const { normalizedWsId: wsId, sbAdmin } = access.context;

  const parsed = feeLockListQuerySchema.safeParse(
    searchParamsToRecord(new URL(request.url).searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const { month, groupId, status, q, page, pageSize } = parsed.data;
  const periodMonth = `${month}-01`;

  if (groupId) {
    const { data: group, error } = await sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('id', groupId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (error) return feeLockErrorResponse(error);
    if (!group) {
      return NextResponse.json({ message: 'Unknown class' }, { status: 400 });
    }
  }

  const currency = await getFeeLockCurrency(wsId);
  // Every read pages past PostgREST max_rows (1000) with .range() on a stable order.
  const [baseline, locks] = await Promise.all([
    readAllPages((from, to) =>
      sbAdmin
        .schema('private')
        .rpc('fee_lock_baseline', {
          p_ws_id: wsId,
          p_month: periodMonth,
          p_currency: currency,
        })
        .range(from, to)
    ),
    readAllPages((from, to) =>
      sbAdmin
        .from('fee_locks')
        .select(
          'id, student_id, status, revision, version, total_amount, updated_at, updated_by'
        )
        .eq('ws_id', wsId)
        .eq('period_month', periodMonth)
        .order('id')
        .range(from, to)
    ),
  ]);
  if (baseline.error) return feeLockErrorResponse(baseline.error);
  if (locks.error) return feeLockErrorResponse(locks.error);

  const rows = new Map<string, FeeLockListRow>();
  for (const cls of baseline.rows) {
    const row = rows.get(cls.student_id) ?? {
      student_id: cls.student_id,
      student_name: cls.student_name ?? '',
      classes: [],
      baseline_total: 0,
      lock: null,
    };
    row.classes.push({
      group_id: cls.group_id,
      group_name: cls.group_name,
      product_id: cls.product_id ?? null,
      unit_id: cls.unit_id ?? null,
      warehouse_id: cls.warehouse_id ?? null,
      baseline_quantity: cls.session_count,
      unit_price: cls.unit_price,
      baseline_amount: cls.baseline_amount,
    });
    row.baseline_total += cls.baseline_amount;
    rows.set(cls.student_id, row);
  }

  const lockRows = locks.rows;
  const missingStudentIds = [
    ...new Set(lockRows.map((lock) => lock.student_id)),
  ].filter((id) => !rows.has(id));
  const editorIds = [
    ...new Set(lockRows.flatMap((lock) => lock.updated_by ?? [])),
  ];
  const [students, editors] = await Promise.all([
    readAllInChunks(missingStudentIds, (ids, from, to) =>
      sbAdmin
        .from('workspace_users')
        .select('id, full_name, display_name')
        .eq('ws_id', wsId)
        .in('id', ids)
        .order('id')
        .range(from, to)
    ),
    readAllInChunks(editorIds, (ids, from, to) =>
      sbAdmin
        .from('users')
        .select('id, display_name')
        .in('id', ids)
        .order('id')
        .range(from, to)
    ),
  ]);
  if (students.error) return feeLockErrorResponse(students.error);
  if (editors.error) return feeLockErrorResponse(editors.error);

  for (const student of students.rows) {
    rows.set(student.id, {
      student_id: student.id,
      student_name: student.full_name ?? student.display_name ?? '',
      classes: [],
      baseline_total: 0,
      lock: null,
    });
  }
  const editorNames = new Map(
    editors.rows.map((user) => [user.id, user.display_name ?? null])
  );
  for (const lock of lockRows) {
    const row = rows.get(lock.student_id);
    if (!row) continue;
    row.lock = {
      id: lock.id,
      status: lock.status as 'draft' | 'locked',
      revision: lock.revision,
      version: lock.version,
      total_amount: lock.total_amount,
      updated_at: lock.updated_at,
      updated_by_name: lock.updated_by
        ? (editorNames.get(lock.updated_by) ?? null)
        : null,
    };
  }

  const term = foldFeeLockSearchText(q);
  const filtered = [...rows.values()]
    .filter(
      (row) =>
        (!groupId || row.classes.some((cls) => cls.group_id === groupId)) &&
        (!status ||
          (status === 'none' ? !row.lock : row.lock?.status === status)) &&
        (!term || foldFeeLockSearchText(row.student_name).includes(term))
    )
    .sort(
      (a, b) =>
        a.student_name.localeCompare(b.student_name, 'vi') ||
        a.student_id.localeCompare(b.student_id)
    );

  const body: FeeLockListResponse = {
    data: filtered.slice((page - 1) * pageSize, page * pageSize),
    count: filtered.length,
    currency,
  };
  return NextResponse.json(body);
}

/**
 * Save a draft (create_invoices). The body carries quantities, catalogue ids
 * and reasons only; private.fee_lock_save_draft checks every id against the
 * workspace and computes every amount, with the platform user as the actor.
 */
export async function PUT(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFeeLockRouteContext(request, rawWsId, [
    'create_invoices',
  ]);
  if (access.response) return access.response;
  const { normalizedWsId: wsId, sbAdmin, user } = access.context;

  const body = await parseFeeLockBody(request, feeLockSaveDraftRequestSchema);
  if (!body) return invalidFeeLockBody();
  // Client-sent amounts must fit FEE_LOCK_MAX_MONEY; SQL rechecks every computed amount (22003).
  const inRange = body.lines.every((line) =>
    'unit_price' in line
      ? isFeeLockMoneyInRange(line.unit_price * line.quantity)
      : isFeeLockMoneyInRange(
          'adjustment_amount' in line ? line.adjustment_amount : 0
        )
  );
  if (!inRange) return feeLockErrorResponse({ code: '22003' });

  const periodMonth = `${body.month}-01`;
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('fee_lock_save_draft', {
      p_ws_id: wsId,
      p_actor_id: user.id,
      p_student_id: body.student_id,
      p_month: periodMonth,
      // NULL creates a new draft; the generated argument type is non-null.
      p_expected_version: (body.expected_version ?? null) as unknown as number,
      p_lines: body.lines as unknown as Json,
      p_note: body.note,
      p_currency: await getFeeLockCurrency(wsId),
    });
  if (error) {
    return feeLockWriteErrorResponse(sbAdmin, wsId, error, {
      student_id: body.student_id,
      period_month: periodMonth,
    });
  }
  return NextResponse.json(data);
}
