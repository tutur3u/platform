import { renderFeeNotice } from '@tuturuuu/finance-core/fee-lock';
import { feeLockExportRequestSchema } from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import type { Json } from '@tuturuuu/types/supabase';
import { NextResponse } from 'next/server';
import { buildFeeLockExportSheets } from '@/lib/fee-lock/export-rows';
import {
  FEE_LOCK_EXPORT_CONTENT_TYPE,
  feeLockExportFileName,
  sha256Hex,
  writeFeeLockWorkbook,
} from '@/lib/fee-lock/export-workbook';
import { feeLockErrorResponse, getFeeLockRouteContext } from '../access';
import {
  activeFeeNoticeTemplate,
  getFeeNoticeCentreName,
  listFeeNoticeTemplates,
} from '../template/template-store';
import { loadFeeLockExportEntries } from './load-entries';

interface Params {
  params: Promise<{ wsId: string }>;
}

const METADATA_BUDGET = 7000; // fee_lock_events.metadata is capped at 8 KB
/** The order loadFeeLockExportEntries returns, logged so an export can be replayed. */
const EXPORT_SORT = 'student_name:vi,fee_lock_id';

/**
 * Server-built Excel export of a month's fee locks: locked revisions (their
 * immutable snapshots) by default, drafts too with `status: 'all'`. One row
 * per student (Trà 15:12 Q1). Streams the bytes, never stores them, and logs
 * an `exported` event with their SHA-256 before answering.
 */
export async function POST(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFeeLockRouteContext(request, rawWsId, [
    'view_invoices',
    'export_finance_data',
  ]);
  if (access.response) return access.response;
  const { normalizedWsId: wsId, sbAdmin, user } = access.context;

  const parsed = feeLockExportRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const { month, groupId, status, locale, include_notice } = parsed.data;

  const loaded = await loadFeeLockExportEntries(sbAdmin, wsId, {
    periodMonth: `${month}-01`,
    groupId,
    status,
  });
  if (loaded.response) return loaded.response;
  const ordered = loaded.entries;
  let entries = ordered.map(([, entry]) => entry);
  let templateVersion: number | null = null;
  if (include_notice) {
    const [listed, centre] = await Promise.all([
      listFeeNoticeTemplates(sbAdmin, wsId),
      getFeeNoticeCentreName(sbAdmin, wsId),
    ]);
    if (listed.response) return listed.response;
    if (centre.response) return centre.response;
    const template = activeFeeNoticeTemplate(listed.versions);
    templateVersion = template.version;
    // One cell per student (Trà 15:12 Q1): per-class notices share the cell.
    entries = entries.map((entry) =>
      entry.status !== 'locked'
        ? entry
        : {
            ...entry,
            notice: renderFeeNotice(entry, template, {
              centreName: centre.name,
            })
              .map((notice) => notice.text)
              .join('\n\n'),
          }
    );
  }
  const bytes = writeFeeLockWorkbook(
    buildFeeLockExportSheets(entries, locale, include_notice)
  );

  // Ids, enums, counts and digests only: no names (design §2.4). The request
  // parameters are always logged, so a revision list left out for size can be
  // rebuilt and checked against revisions_sha256.
  const revisions = ordered.flatMap(([id, entry]) =>
    entry.revision === null ? [] : [[id, entry.revision]]
  );
  const metadata: Record<string, Json> = {
    ws_id: wsId,
    period: month,
    status_filter: status,
    group_id: groupId ?? null,
    locale,
    sort: EXPORT_SORT,
    include_notice,
    row_count: ordered.length,
    sha256: await sha256Hex(bytes),
    template_version: templateVersion,
    revisions_count: revisions.length,
    revisions_sha256: await sha256Hex(
      new TextEncoder().encode(JSON.stringify(revisions))
    ),
  };
  if (JSON.stringify({ ...metadata, revisions }).length <= METADATA_BUDGET) {
    metadata.revisions = revisions;
  }
  const { error: eventError } = await sbAdmin.from('fee_lock_events').insert({
    ws_id: wsId,
    event_type: 'exported',
    actor_id: user.id,
    metadata,
  });
  if (eventError) return feeLockErrorResponse(eventError);

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': FEE_LOCK_EXPORT_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${feeLockExportFileName(month, wsId)}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Fee-Lock-Row-Count': String(ordered.length),
    },
  });
}
