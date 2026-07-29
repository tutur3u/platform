import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types/db';
import {
  aggregateLedgerEvents,
  type BreakdownRow,
  type ConsumptionEvent,
  type LedgerEvent,
} from './consumption-fallback-aggregation';

export { mergeConsumptionBreakdowns } from './consumption-fallback-aggregation';
export type { BreakdownRow, ConsumptionEvent };

type LedgerRow = Pick<
  Database['public']['Tables']['ai_credit_transactions']['Row'],
  | 'amount'
  | 'cost_usd'
  | 'created_at'
  | 'feature'
  | 'id'
  | 'image_count'
  | 'input_tokens'
  | 'metadata'
  | 'model_id'
  | 'output_tokens'
  | 'reasoning_tokens'
  | 'search_count'
  | 'user_id'
  | 'ws_id'
>;
type QueryError = { code?: string; message?: string } | null;

const LEDGER_FIELDS =
  'id, ws_id, user_id, amount, cost_usd, model_id, feature, input_tokens, output_tokens, reasoning_tokens, image_count, search_count, metadata, created_at';
const LEDGER_PAGE_SIZE = 1000;

export async function getLedgerConsumptionBreakdown({
  from,
  sbAdmin,
  to,
  userId,
  workspaceId,
}: {
  from: string;
  sbAdmin: TypedSupabaseClient;
  to: string;
  userId: string;
  workspaceId: string;
}): Promise<{ data: BreakdownRow[] | null; error: QueryError }> {
  const ledger = await fetchLedgerConsumptionEvents({
    cursor: null,
    from,
    maxRows: Number.POSITIVE_INFINITY,
    sbAdmin,
    to,
    userId,
    workspaceId,
  });
  if (ledger.error) return { data: null, error: ledger.error };

  return {
    data: aggregateLedgerEvents(ledger.data ?? []),
    error: null,
  };
}

export async function listLedgerConsumptionEvents({
  cursor,
  feature,
  from,
  maxRows,
  model,
  sbAdmin,
  status,
  to,
  userId,
  workspaceId,
}: {
  cursor: { createdAt: string; id: string } | null;
  feature?: string;
  from: string;
  maxRows: number;
  model?: string;
  sbAdmin: TypedSupabaseClient;
  status?: string;
  to: string;
  userId: string;
  workspaceId: string;
}): Promise<{ data: ConsumptionEvent[] | null; error: QueryError }> {
  const result = await fetchLedgerConsumptionEvents({
    cursor,
    feature,
    from,
    maxRows,
    model,
    sbAdmin,
    status,
    to,
    userId,
    workspaceId,
  });
  if (result.error) return result;

  return {
    data:
      result.data?.map(({ source_id: _sourceId, ...event }) => event) ?? null,
    error: null,
  };
}

async function fetchLedgerConsumptionEvents({
  cursor,
  feature,
  from,
  maxRows,
  model,
  sbAdmin,
  status,
  to,
  userId,
  workspaceId,
}: {
  cursor: { createdAt: string; id: string } | null;
  feature?: string;
  from: string;
  maxRows: number;
  model?: string;
  sbAdmin: TypedSupabaseClient;
  status?: string;
  to: string;
  userId: string;
  workspaceId: string;
}): Promise<{ data: LedgerEvent[] | null; error: QueryError }> {
  if (status && status !== 'succeeded') return { data: [], error: null };

  const { data: tier, error: tierError } = await sbAdmin.rpc(
    '_resolve_workspace_tier',
    { p_ws_id: workspaceId }
  );
  if (tierError) return { data: null, error: tierError };

  const events: LedgerEvent[] = [];
  let offset = 0;

  while (events.length < maxRows) {
    let query = sbAdmin
      .from('ai_credit_transactions')
      .select(LEDGER_FIELDS)
      .eq('transaction_type', 'deduction')
      .gte('created_at', from)
      .lt('created_at', to);

    query =
      (tier ?? 'FREE') === 'FREE'
        ? query.or(
            `ws_id.eq.${workspaceId},and(ws_id.is.null,user_id.eq.${userId})`
          )
        : query.eq('ws_id', workspaceId);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }

    const page = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + LEDGER_PAGE_SIZE - 1);

    if (page.error) return { data: null, error: page.error };

    const rows = (page.data ?? []) as LedgerRow[];
    const linkedRunIds = await getExistingStudioRunIds(rows, sbAdmin);
    if (linkedRunIds.error) {
      return { data: null, error: linkedRunIds.error };
    }

    for (const row of rows) {
      const runId = getStudioRunReference(row.metadata);
      if (runId && linkedRunIds.data?.has(runId)) continue;
      const event = ledgerRowToEvent(row);
      if (feature && event.feature !== feature) continue;
      if (model && event.model_id !== model) continue;
      events.push(event);
      if (events.length >= maxRows) break;
    }

    if (rows.length < LEDGER_PAGE_SIZE) break;
    offset += rows.length;
  }

  return {
    data: events,
    error: null,
  };
}

function ledgerRowToEvent(row: LedgerRow): LedgerEvent {
  return {
    billed_credits: Math.abs(Number(row.amount)),
    completed_at: row.created_at,
    created_at: row.created_at,
    embedding_units: 0,
    error_class: null,
    event_id: row.id,
    feature: row.feature?.trim() || 'unclassified',
    first_token_latency_ms: null,
    image_units: nonNegative(row.image_count),
    input_tokens: nonNegative(row.input_tokens),
    latency_ms: null,
    model_id: row.model_id?.trim() || 'unknown',
    output_tokens: nonNegative(row.output_tokens),
    provider_cost_usd: nonNegative(row.cost_usd),
    reasoning_tokens: nonNegative(row.reasoning_tokens),
    request_id: `credit:${row.id}`,
    search_units: nonNegative(row.search_count),
    source_id: row.user_id ?? 'workspace',
    source_type: 'workspace_credit',
    status: 'succeeded',
  };
}

async function getExistingStudioRunIds(
  rows: LedgerRow[],
  sbAdmin: TypedSupabaseClient
): Promise<{ data: Set<string> | null; error: QueryError }> {
  const ids = [
    ...new Set(
      rows
        .map((row) => getStudioRunReference(row.metadata))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (ids.length === 0) return { data: new Set(), error: null };

  const result = await sbAdmin
    .schema('private')
    .from('ai_studio_runs')
    .select('id')
    .in('id', ids);
  if (result.error) return { data: null, error: result.error };

  return {
    data: new Set((result.data ?? []).map((run) => run.id)),
    error: null,
  };
}

function getStudioRunReference(metadata: LedgerRow['metadata']) {
  if (
    metadata === null ||
    Array.isArray(metadata) ||
    typeof metadata !== 'object' ||
    typeof metadata.run_id !== 'string'
  ) {
    return null;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    metadata.run_id
  )
    ? metadata.run_id
    : null;
}

function nonNegative(value: number | null) {
  return Math.max(Number(value ?? 0), 0);
}
