import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types/db';

type BreakdownRow =
  Database['private']['Functions']['get_ai_studio_consumption_breakdown']['Returns'][number];
type GeneratedConsumptionEvent =
  Database['private']['Functions']['list_ai_studio_consumption_events']['Returns'][number];
type ConsumptionEvent = Omit<
  GeneratedConsumptionEvent,
  'completed_at' | 'error_class' | 'first_token_latency_ms' | 'latency_ms'
> & {
  completed_at: string | null;
  error_class: string | null;
  first_token_latency_ms: number | null;
  latency_ms: number | null;
};

const LEGACY_RUN_FIELDS =
  'id, request_id, api_key_id, feature, model_id, status, billed_credits, provider_cost_usd, input_tokens, output_tokens, reasoning_tokens, embedding_units, image_units, latency_ms, first_token_latency_ms, error_class, metadata, created_at, completed_at';

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

  return {
    data:
      legacy.data?.map(
        (row): BreakdownRow => ({
          ...row,
          latency_sample_count: row.request_count,
          search_units: 0,
        })
      ) ?? null,
    error: legacy.error,
  };
}

export async function listAiStudioConsumptionEvents({
  cursor,
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
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }

  const legacy = await query;
  return {
    data:
      legacy.data?.map(
        (run): ConsumptionEvent => ({
          billed_credits: run.billed_credits,
          completed_at: run.completed_at,
          created_at: run.created_at,
          embedding_units: run.embedding_units,
          error_class: run.error_class,
          event_id: run.id,
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
          source_type: resolveLegacySourceType(run.api_key_id, run.metadata),
          status: run.status,
        })
      ) ?? null,
    error: legacy.error,
  };
}

function isMissingFunction(error: { code?: string } | null) {
  return error?.code === '42883' || error?.code === 'PGRST202';
}

function resolveLegacySourceType(apiKeyId: string | null, metadata: unknown) {
  if (apiKeyId) return 'api_key';
  if (
    metadata &&
    !Array.isArray(metadata) &&
    typeof metadata === 'object' &&
    ('external_app_id' in metadata ||
      ('billing_mode' in metadata &&
        metadata.billing_mode === 'external_app_unmetered'))
  ) {
    return 'external_app';
  }
  return 'session';
}
