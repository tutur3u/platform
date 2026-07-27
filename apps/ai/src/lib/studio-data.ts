import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

const KEY_FIELDS =
  'id, name, prefix, environment, allowed_models, expires_at, revoked_at, last_used_at, requests_per_minute, credit_budget, credits_used, created_at';
const RUN_FIELDS =
  'id, request_id, feature, model_id, status, billed_credits, provider_cost_usd, input_tokens, output_tokens, latency_ms, first_token_latency_ms, created_at';

export type AiStudioOverview = Awaited<ReturnType<typeof getAiStudioOverview>>;

export async function getAiStudioOverview({
  sbAdmin,
  workspaceId,
  workspaceName,
}: {
  sbAdmin: TypedSupabaseClient;
  workspaceId: string;
  workspaceName: string;
}) {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const [policy, keys, runs, prompts, agents, datasets, usage] =
    await Promise.all([
      sbAdmin
        .schema('private')
        .from('workspace_ai_studio_policies')
        .select('*')
        .eq('ws_id', workspaceId)
        .maybeSingle(),
      sbAdmin
        .schema('private')
        .from('ai_studio_api_keys')
        .select(KEY_FIELDS)
        .eq('ws_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(25),
      sbAdmin
        .schema('private')
        .from('ai_studio_runs')
        .select(RUN_FIELDS)
        .eq('ws_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(50),
      sbAdmin
        .schema('private')
        .from('ai_studio_prompts')
        .select('id, name, slug, description, latest_version, updated_at')
        .eq('ws_id', workspaceId)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .limit(25),
      sbAdmin
        .schema('private')
        .from('ai_studio_agents')
        .select('id, name, slug, description, latest_version, updated_at')
        .eq('ws_id', workspaceId)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .limit(25),
      sbAdmin
        .schema('private')
        .from('ai_studio_datasets')
        .select('id, name, description, updated_at')
        .eq('ws_id', workspaceId)
        .order('updated_at', { ascending: false })
        .limit(25),
      sbAdmin
        .schema('private')
        .from('ai_studio_usage')
        .select(
          'billed_credits, provider_cost_usd, input_tokens, output_tokens, units, feature'
        )
        .eq('ws_id', workspaceId)
        .gte('created_at', since.toISOString()),
    ]);

  const errors = [policy, keys, runs, prompts, agents, datasets, usage]
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
      embeddingUnits:
        acc.embeddingUnits + (row.feature === 'embedding' ? row.units : 0),
      imageUnits: acc.imageUnits + (row.feature === 'image' ? row.units : 0),
      inputTokens: acc.inputTokens + row.input_tokens,
      outputTokens: acc.outputTokens + row.output_tokens,
      providerCostUsd: acc.providerCostUsd + Number(row.provider_cost_usd),
    }),
    {
      billedCredits: 0,
      embeddingUnits: 0,
      imageUnits: 0,
      inputTokens: 0,
      outputTokens: 0,
      providerCostUsd: 0,
    }
  );

  return {
    agents: agents.data ?? [],
    datasets: datasets.data ?? [],
    keys: keys.data ?? [],
    policy: policy.data,
    prompts: prompts.data ?? [],
    runs: runs.data ?? [],
    totals,
    workspace: { id: workspaceId, name: workspaceName },
  };
}
