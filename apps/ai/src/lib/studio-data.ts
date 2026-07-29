import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getAiStudioConsumptionBreakdown,
  listAiStudioConsumptionEvents,
} from './consumption-data';

const KEY_FIELDS =
  'id, name, prefix, environment, allowed_models, expires_at, revoked_at, last_used_at, requests_per_minute, credit_budget, credits_used, created_at';

export type AiStudioOverview = Awaited<ReturnType<typeof getAiStudioOverview>>;

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

  const totals = (usage.data ?? []).reduce(
    (acc, row) => ({
      billedCredits: acc.billedCredits + Number(row.billed_credits),
      embeddingUnits: acc.embeddingUnits + Number(row.embedding_units),
      imageUnits: acc.imageUnits + Number(row.image_units),
      inputTokens: acc.inputTokens + Number(row.input_tokens),
      outputTokens: acc.outputTokens + Number(row.output_tokens),
      providerCostUsd: acc.providerCostUsd + Number(row.provider_cost_usd),
      searchUnits: acc.searchUnits + Number(row.search_units),
    }),
    {
      billedCredits: 0,
      embeddingUnits: 0,
      imageUnits: 0,
      inputTokens: 0,
      outputTokens: 0,
      providerCostUsd: 0,
      searchUnits: 0,
    }
  );

  return {
    keys: keys.data ?? [],
    policy: policy.data,
    runs: (runs.data ?? []).map((run) => ({
      feature: run.feature,
      id: run.event_id,
      model_id: run.model_id,
      request_id: run.request_id,
      status: run.status,
    })),
    totals,
    workspace: { id: workspaceId, name: workspaceName },
  };
}
