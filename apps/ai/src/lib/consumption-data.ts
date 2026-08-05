import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  type BreakdownRow,
  type ConsumptionEvent,
  getLedgerConsumptionBreakdown,
  listLedgerConsumptionEvents,
  mergeConsumptionBreakdowns,
} from './consumption-fallback';

const LEGACY_RUN_FIELDS =
  'id, request_id, api_key_id, actor_id, feature, model_id, status, billed_credits, unmetered_credits, provider_cost_usd, input_tokens, output_tokens, reasoning_tokens, embedding_units, image_units, latency_ms, first_token_latency_ms, error_class, metadata, created_at, completed_at';

export async function getAiStudioConsumptionBreakdown({
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
}) {
  const result = await sbAdmin
    .schema('private')
    .rpc('get_ai_studio_consumption_breakdown', {
      p_from: from,
      p_to: to,
      p_user_id: userId,
      p_ws_id: workspaceId,
    });

  if (!isMissingFunction(result.error)) return result;

  const legacy = await sbAdmin
    .schema('private')
    .rpc('get_ai_studio_usage_breakdown', {
      p_from: from,
      p_to: to,
      p_ws_id: workspaceId,
    });

  if (legacy.error) return { data: null, error: legacy.error };

  const ledger = await getLedgerConsumptionBreakdown({
    from,
    sbAdmin,
    to,
    userId,
    workspaceId,
  });
  if (ledger.error) return ledger;

  const legacyRows =
    legacy.data?.map(
      (row): BreakdownRow => ({
        ...row,
        // The legacy breakdown predates both dimensions: everything it covers was
        // user-triggered, and nothing on it ran unmetered.
        execution_mode: 'interactive',
        latency_sample_count: row.request_count,
        search_units: 0,
        unmetered_credits: 0,
      })
    ) ?? [];

  return {
    data: mergeConsumptionBreakdowns(legacyRows, ledger.data ?? []),
    error: null,
  };
}

export async function listAiStudioConsumptionEvents({
  cursor,
  executionMode,
  externalApp,
  feature,
  from,
  limit,
  model,
  sbAdmin,
  status,
  to,
  userId,
  workspaceId,
}: {
  cursor: { createdAt: string; id: string } | null;
  executionMode?: string;
  externalApp?: string;
  feature?: string;
  from: string;
  limit: number;
  model?: string;
  sbAdmin: TypedSupabaseClient;
  status?: string;
  to: string;
  userId: string;
  workspaceId: string;
}) {
  const result = await sbAdmin
    .schema('private')
    .rpc('list_ai_studio_consumption_events', {
      p_cursor_created_at: cursor?.createdAt,
      p_cursor_id: cursor?.id,
      p_execution_mode: executionMode,
      p_external_app: externalApp,
      p_feature: feature,
      p_from: from,
      p_limit: limit,
      p_model: model,
      p_status: status,
      p_to: to,
      p_user_id: userId,
      p_ws_id: workspaceId,
    });

  if (!isMissingFunction(result.error)) return result;

  let query = sbAdmin
    .schema('private')
    .from('ai_studio_runs')
    .select(LEGACY_RUN_FIELDS)
    .eq('ws_id', workspaceId)
    .gte('created_at', from)
    .lt('created_at', to)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (feature) query = query.eq('feature', feature);
  if (model) query = query.eq('model_id', model);
  // The legacy table has no generated columns for these, so they are matched
  // against the run metadata the RPC derives them from. 'interactive' is the
  // absence of a background marker, not a stored value — runs predating the
  // machine credential carry no execution_mode at all and are all interactive.
  if (externalApp) {
    query = query.contains('metadata', { external_app_id: externalApp });
  }
  if (executionMode === 'background') {
    query = query.contains('metadata', { execution_mode: 'background' });
  } else if (executionMode === 'interactive') {
    query = query.not('metadata->>execution_mode', 'eq', 'background');
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }

  const legacy = await query;
  if (legacy.error) return { data: null, error: legacy.error };

  // Ledger deductions are workspace credit spend by a user; no external app and
  // no background execution can appear there, so either filter excludes them all.
  const ledger =
    externalApp || executionMode === 'background'
      ? { data: [], error: null }
      : await listLedgerConsumptionEvents({
          cursor,
          feature,
          from,
          maxRows: limit,
          model,
          sbAdmin,
          status,
          to,
          userId,
          workspaceId,
        });
  if (ledger.error) return ledger;

  const legacyEvents =
    legacy.data?.map(
      (run): ConsumptionEvent => ({
        billed_credits: run.billed_credits,
        completed_at: run.completed_at,
        created_at: run.created_at,
        embedding_units: run.embedding_units,
        error_class: run.error_class,
        event_id: run.id,
        execution_mode: resolveLegacyExecutionMode(run.metadata),
        feature: run.feature,
        first_token_latency_ms: run.first_token_latency_ms,
        image_units: run.image_units,
        input_tokens: run.input_tokens,
        latency_ms: run.latency_ms,
        model_id: run.model_id,
        output_tokens: run.output_tokens,
        provider_cost_usd: run.provider_cost_usd,
        reasoning_tokens: run.reasoning_tokens,
        request_id: run.request_id,
        search_units: 0,
        source_id: resolveLegacySourceId(
          run.api_key_id,
          run.actor_id,
          run.metadata
        ),
        source_type: resolveLegacySourceType(run.api_key_id, run.metadata),
        status: run.status,
        unmetered_credits: run.unmetered_credits,
      })
    ) ?? [];

  return {
    data: [...legacyEvents, ...(ledger.data ?? [])]
      .sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) ||
          b.event_id.localeCompare(a.event_id)
      )
      .slice(0, limit),
    error: null,
  };
}

function isMissingFunction(error: { code?: string } | null) {
  return error?.code === '42883' || error?.code === 'PGRST202';
}

function metadataRecord(metadata: unknown) {
  return metadata && !Array.isArray(metadata) && typeof metadata === 'object'
    ? (metadata as Record<string, unknown>)
    : null;
}

function externalAppIdOf(metadata: unknown) {
  const record = metadataRecord(metadata);
  const appId = record?.external_app_id;
  return typeof appId === 'string' && appId.trim() ? appId.trim() : null;
}

// Mirrors collect_ai_studio_consumption_events: a key bound to an app is a
// credential the app authenticates with, so the app — not the key — is the
// spender. Diverging here would make the fallback disagree with the RPC.
function resolveLegacySourceType(apiKeyId: string | null, metadata: unknown) {
  const record = metadataRecord(metadata);
  if (
    externalAppIdOf(metadata) ||
    (record && record.billing_mode === 'external_app_unmetered')
  ) {
    return 'external_app';
  }
  if (apiKeyId) return 'api_key';
  return 'session';
}

function resolveLegacySourceId(
  apiKeyId: string | null,
  actorId: string | null,
  metadata: unknown
) {
  return externalAppIdOf(metadata) ?? apiKeyId ?? actorId ?? 'session';
}

function resolveLegacyExecutionMode(metadata: unknown) {
  const mode = metadataRecord(metadata)?.execution_mode;
  return mode === 'background' ? 'background' : 'interactive';
}
