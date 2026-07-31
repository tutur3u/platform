import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getAiStudioConsumptionBreakdown,
  listAiStudioConsumptionEvents,
} from './consumption-data';
import type { BreakdownRow } from './consumption-fallback-aggregation';

const KEY_FIELDS =
  'id, name, prefix, environment, allowed_models, expires_at, revoked_at, last_used_at, requests_per_minute, credit_budget, credits_used, created_at';

export type AiStudioOverview = Awaited<ReturnType<typeof getAiStudioOverview>>;
export type AiStudioOverviewRun = AiStudioOverview['runs'][number];
export type AiStudioOverviewDay = AiStudioOverview['daily'][number];

export async function getAiStudioOverview({
  includeKeys = false,
  sbAdmin,
  userId,
  workspaceId,
  workspaceName,
}: {
  includeKeys?: boolean;
  sbAdmin: TypedSupabaseClient;
  userId: string;
  workspaceId: string;
  workspaceName: string;
}) {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const range = {
    from: since.toISOString(),
    to: new Date().toISOString(),
  };
  const [policy, keys, runs, usage] = await Promise.all([
    sbAdmin
      .schema('private')
      .from('workspace_ai_studio_policies')
      .select('*')
      .eq('ws_id', workspaceId)
      .maybeSingle(),
    includeKeys
      ? sbAdmin
          .schema('private')
          .from('ai_studio_api_keys')
          .select(KEY_FIELDS)
          .eq('ws_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [], error: null }),
    listAiStudioConsumptionEvents({
      cursor: null,
      from: range.from,
      limit: 50,
      sbAdmin,
      to: range.to,
      userId,
      workspaceId,
    }),
    getAiStudioConsumptionBreakdown({
      ...range,
      sbAdmin,
      userId,
      workspaceId,
    }),
  ]);

  const errors = [policy, keys, runs, usage]
    .map((result) => result.error)
    .filter(Boolean);
  if (errors.length) {
    console.error('AI Studio overview query failed', {
      codes: errors.map((error) => error?.code),
      workspaceId,
    });
    throw new Error('AI Studio overview unavailable');
  }

  const usageRows = usage.data ?? [];
  const totals = usageRows.reduce(
    (acc, row) => ({
      abortedCount: acc.abortedCount + Number(row.aborted_count),
      billedCredits: acc.billedCredits + Number(row.billed_credits),
      embeddingUnits: acc.embeddingUnits + Number(row.embedding_units),
      failedCount: acc.failedCount + Number(row.failed_count),
      imageUnits: acc.imageUnits + Number(row.image_units),
      inputTokens: acc.inputTokens + Number(row.input_tokens),
      latencySampleCount:
        acc.latencySampleCount + Number(row.latency_sample_count),
      latencyTotalMs:
        acc.latencyTotalMs +
        Number(row.average_latency_ms) * Number(row.latency_sample_count),
      outputTokens: acc.outputTokens + Number(row.output_tokens),
      providerCostUsd: acc.providerCostUsd + Number(row.provider_cost_usd),
      reasoningTokens: acc.reasoningTokens + Number(row.reasoning_tokens),
      requestCount: acc.requestCount + Number(row.request_count),
      searchUnits: acc.searchUnits + Number(row.search_units),
      succeededCount: acc.succeededCount + Number(row.succeeded_count),
    }),
    {
      abortedCount: 0,
      billedCredits: 0,
      embeddingUnits: 0,
      failedCount: 0,
      imageUnits: 0,
      inputTokens: 0,
      latencySampleCount: 0,
      latencyTotalMs: 0,
      outputTokens: 0,
      providerCostUsd: 0,
      reasoningTokens: 0,
      requestCount: 0,
      searchUnits: 0,
      succeededCount: 0,
    }
  );

  return {
    daily: buildDailySeries(usageRows),
    keys: keys.data ?? [],
    models: [...new Set(usageRows.map((row) => row.model_id).filter(Boolean))],
    periodStart: range.from,
    policy: policy.data,
    runs: (runs.data ?? []).map((run) => ({
      billedCredits: Number(run.billed_credits),
      createdAt: run.created_at,
      feature: run.feature,
      id: run.event_id,
      latencyMs: run.latency_ms === null ? null : Number(run.latency_ms),
      model_id: run.model_id,
      request_id: run.request_id,
      status: run.status,
    })),
    totals: {
      ...totals,
      averageLatencyMs: totals.latencySampleCount
        ? totals.latencyTotalMs / totals.latencySampleCount
        : 0,
    },
    workspace: { id: workspaceId, name: workspaceName },
  };
}

/**
 * Collapses the per-model/feature/source breakdown into one row per day so the
 * overview can draw a trend without a second round trip.
 */
function buildDailySeries(rows: BreakdownRow[]) {
  const byDate = new Map<
    string,
    { cost: number; credits: number; date: string; requests: number }
  >();

  for (const row of rows) {
    const date = row.bucket_date;
    const entry = byDate.get(date) ?? {
      cost: 0,
      credits: 0,
      date,
      requests: 0,
    };
    entry.cost += Number(row.provider_cost_usd);
    entry.credits += Number(row.billed_credits);
    entry.requests += Number(row.request_count);
    byDate.set(date, entry);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
