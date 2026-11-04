import {
  type FeeNoticeSnapshot,
  renderFeeNotice,
  validateFeeNoticeTemplate,
} from '@tuturuuu/finance-core/fee-lock';
import {
  FEE_NOTICE_TEMPLATE_INVALID_CODE,
  type FeeNoticePreviewResponse,
  feeLockSnapshotSchema,
  feeNoticePreviewRequestSchema,
} from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import { NextResponse } from 'next/server';
import { feeLockErrorResponse, getFeeLockRouteContext } from '../../access';
import {
  activeFeeNoticeTemplate,
  getFeeNoticeCentreName,
  listFeeNoticeTemplates,
} from '../template-store';

interface Params {
  params: Promise<{ wsId: string }>;
}

// biome-ignore format: compact sample
/** Built-in sample for a workspace with no locked fee yet (two classes and a book). */
const SAMPLE: FeeNoticeSnapshot = {
  student_name: 'Nguyễn Văn A',
  period_month: '2026-12-01',
  currency: 'VND',
  total_amount: 1_350_000,
  lines: [
    { kind: 'tuition', group_id: 'sample-a', group_name: 'Lớp A', label: 'Học phí Lớp A', unit_label: 'buổi', unit_price: 100_000, quantity: 8, line_amount: 800_000, sort_order: 0 },
    { kind: 'tuition', group_id: 'sample-b', group_name: 'Lớp B', label: 'Học phí Lớp B', unit_label: 'buổi', unit_price: 100_000, quantity: 4, line_amount: 400_000, sort_order: 1 },
    { kind: 'extra', group_id: null, group_name: null, label: 'Sách', unit_label: 'bộ', unit_price: 150_000, quantity: 1, line_amount: 150_000, sort_order: 2 },
  ],
};

const notFound = () =>
  NextResponse.json({ message: 'Not found' }, { status: 404 });

/**
 * Renders the notice (plain text) for one student's latest locked revision,
 * or for the built-in sample, with the active template or the unsaved one in
 * the body. Every read is scoped to the gate's workspace.
 */
export async function POST(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFeeLockRouteContext(request, rawWsId, [
    'view_invoices',
  ]);
  if (access.response) return access.response;
  const { normalizedWsId: wsId, sbAdmin } = access.context;

  const parsed = feeNoticePreviewRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const { lockId, template: draft } = parsed.data;
  const issues = draft ? validateFeeNoticeTemplate(draft) : [];
  if (issues.length) {
    return NextResponse.json(
      { code: FEE_NOTICE_TEMPLATE_INVALID_CODE, issues },
      { status: 400 }
    );
  }

  let snapshot: FeeNoticeSnapshot = SAMPLE;
  if (lockId) {
    const { data: lock, error } = await sbAdmin
      .from('fee_locks')
      .select('id, revision')
      .eq('id', lockId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (error) return feeLockErrorResponse(error);
    if (!lock) return notFound();
    if (lock.revision < 1) {
      return NextResponse.json(
        { code: 'FEE_LOCK_NOT_LOCKED' },
        { status: 400 }
      );
    }
    const { data: row, error: revisionError } = await sbAdmin
      .from('fee_lock_revisions')
      .select('snapshot')
      .eq('fee_lock_id', lock.id)
      .eq('ws_id', wsId)
      .eq('revision', lock.revision)
      .maybeSingle();
    if (revisionError) return feeLockErrorResponse(revisionError);
    const locked = feeLockSnapshotSchema.safeParse(row?.snapshot);
    if (!locked.success || locked.data.ws_id !== wsId) {
      console.error('[fee-locks] preview: snapshot does not match its lock');
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
    snapshot = locked.data;
  }

  const [listed, centre] = await Promise.all([
    draft ? null : listFeeNoticeTemplates(sbAdmin, wsId),
    getFeeNoticeCentreName(sbAdmin, wsId),
  ]);
  if (listed?.response) return listed.response;
  if (centre.response) return centre.response;
  const active = listed ? activeFeeNoticeTemplate(listed.versions) : null;
  const template = draft ?? active;
  if (!template) return notFound();

  const body: FeeNoticePreviewResponse = {
    source: lockId ? 'lock' : 'sample',
    template_version: draft ? null : (active?.version ?? null),
    notices: renderFeeNotice(snapshot, template, {
      centreName: centre.name,
    }).map(({ group_id, text, length, truncated }) => ({
      group_id,
      text,
      length,
      truncated,
    })),
  };
  return NextResponse.json(body);
}
