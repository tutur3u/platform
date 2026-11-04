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
import { loadFeeLockExportEntries } from './load-entries';

interface Params {
  params: Promise<{ wsId: string }>;
}

const METADATA_BUDGET = 7000; // fee_lock_events.metadata is capped at 8 KB

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
  const { month, groupId, status, locale } = parsed.data;

  const loaded = await loadFeeLockExportEntries(sbAdmin, wsId, {
    periodMonth: `${month}-01`,
    groupId,
    status,
  });
  if (loaded.response) return loaded.response;
  const ordered = loaded.entries;
  const bytes = writeFeeLockWorkbook(
    buildFeeLockExportSheets(
      ordered.map(([, entry]) => entry),
      locale
    )
  );

  // Ids, counts and digests only: no names (design §2.4).
  const revisions = ordered.flatMap(([id, entry]) =>
    entry.revision === null ? [] : [[id, entry.revision]]
  );
  const metadata: Record<string, Json> = {
    period: month,
    status_filter: status,
    group_id: groupId ?? null,
    include_notice: false,
    row_count: ordered.length,
    sha256: await sha256Hex(bytes),
    template_version: null,
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
      'Content-Disposition': `attachment; filename="${feeLockExportFileName(month)}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
