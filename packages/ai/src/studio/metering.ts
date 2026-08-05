import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import { AiStudioError } from './errors';

export type AiStudioRunReservation = {
  reservationId: string;
  runId: string;
};

export type ExternalAiStudioRun = {
  runId: string;
};

export type AiStudioUsageCost = {
  billedCredits: number;
  providerCostUsd: number;
};

export type AiStudioRunStepKind = 'grader' | 'model' | 'system' | 'tool';

export type RecordAiStudioRunStepInput = {
  billedCredits?: number;
  completedAt?: string | null;
  errorClass?: string | null;
  inputTokens?: number;
  kind: AiStudioRunStepKind;
  latencyMs?: number | null;
  metadata?: Json;
  modelId?: string | null;
  name: string;
  outputTokens?: number;
  providerCostUsd?: number;
  runId: string;
  sequence: number;
  startedAt?: string;
  status: 'aborted' | 'failed' | 'running' | 'succeeded';
};

export async function recordAiStudioRunStep(
  input: RecordAiStudioRunStepInput
): Promise<void> {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { error } = await sbAdmin
    .schema('private')
    .from('ai_studio_run_steps')
    .upsert(
      {
        billed_credits: input.billedCredits ?? 0,
        completed_at: input.completedAt ?? new Date().toISOString(),
        error_class: input.errorClass ?? null,
        input_tokens: input.inputTokens ?? 0,
        kind: input.kind,
        latency_ms: input.latencyMs ?? null,
        metadata: input.metadata ?? {},
        model_id: input.modelId ?? null,
        name: input.name,
        output_tokens: input.outputTokens ?? 0,
        provider_cost_usd: input.providerCostUsd ?? 0,
        run_id: input.runId,
        sequence: input.sequence,
        started_at: input.startedAt ?? new Date().toISOString(),
        status: input.status,
      },
      { onConflict: 'run_id,sequence' }
    );

  if (error) {
    console.warn('Failed to record AI Studio run step', {
      code: error.code,
      runId: input.runId,
      sequence: input.sequence,
    });
  }
}

export type CalculateAiStudioUsageCostInput = {
  imageCount?: number;
  inputTokens?: number;
  modelId: string;
  outputTokens?: number;
  reasoningTokens?: number;
  searchCount?: number;
  workspaceId: string;
};

export async function calculateAiStudioUsageCost(
  input: CalculateAiStudioUsageCostInput
): Promise<AiStudioUsageCost> {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('calculate_ai_studio_usage_cost', {
      p_image_count: input.imageCount ?? 0,
      p_input_tokens: input.inputTokens ?? 0,
      p_model_id: input.modelId,
      p_output_tokens: input.outputTokens ?? 0,
      p_reasoning_tokens: input.reasoningTokens ?? 0,
      p_search_count: input.searchCount ?? 0,
      p_ws_id: input.workspaceId,
    });

  const cost = data?.[0];
  if (error || !cost) {
    throw new AiStudioError('AI usage cost could not be calculated.', {
      code: 'server_error',
      status: 500,
      type: 'server_error',
    });
  }

  return {
    billedCredits: Number(cost.billed_credits),
    providerCostUsd: Number(cost.provider_cost_usd),
  };
}

export type BeginAiStudioRunInput = {
  actorId: string;
  apiKeyId: string;
  feature: string;
  idempotencyKey?: string | null;
  metadata?: Json;
  modelId: string;
  requestId: string;
  reservedCredits: number;
  workspaceId: string;
};

function reservationError(code: string | null): AiStudioError {
  if (code === 'MODEL_NOT_ALLOWED') {
    return new AiStudioError('This model is not enabled for the workspace.', {
      code: 'model_not_found',
      status: 404,
    });
  }
  if (code === 'RATE_LIMIT_EXCEEDED') {
    return new AiStudioError('The API key rate limit has been reached.', {
      code: 'rate_limit_exceeded',
      status: 429,
      type: 'rate_limit_error',
    });
  }
  if (
    code === 'KEY_BUDGET_EXCEEDED' ||
    code === 'WORKSPACE_BUDGET_EXCEEDED' ||
    code === 'INSUFFICIENT_CREDITS'
  ) {
    return new AiStudioError('The workspace has insufficient AI credits.', {
      code: 'insufficient_credits',
      status: 402,
    });
  }

  return new AiStudioError('The request could not reserve AI credits.', {
    code: 'server_error',
    status: 500,
    type: 'server_error',
  });
}

export async function beginAiStudioRun(
  input: BeginAiStudioRunInput
): Promise<AiStudioRunReservation> {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('begin_ai_studio_run', {
      p_api_key_id: input.apiKeyId,
      p_feature: input.feature,
      p_idempotency_key: input.idempotencyKey ?? undefined,
      p_metadata: input.metadata,
      p_model_id: input.modelId,
      p_request_id: input.requestId,
      p_reserved_credits: input.reservedCredits,
      p_user_id: input.actorId,
      p_ws_id: input.workspaceId,
    });

  const result = data?.[0];
  if (error || !result?.success || !result.run_id || !result.reservation_id) {
    throw reservationError(result?.error_code ?? null);
  }

  return {
    reservationId: result.reservation_id,
    runId: result.run_id,
  };
}

export type BeginExternalAiStudioRunInput = {
  /** Null for machine credentials, which run without a user. */
  actorId: string | null;
  /** Set when a bound API key authenticated the request, for rotation traceability. */
  apiKeyId?: string | null;
  externalAppId: string;
  feature: string;
  idempotencyKey?: string | null;
  metadata?: Json;
  modelId: string;
  requestId: string;
  workspaceId: string;
};

export async function beginExternalAiStudioRun(
  input: BeginExternalAiStudioRunInput
): Promise<ExternalAiStudioRun> {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('begin_external_ai_studio_run', {
      p_api_key_id: input.apiKeyId ?? undefined,
      p_external_app_id: input.externalAppId,
      p_feature: input.feature,
      p_idempotency_key: input.idempotencyKey ?? undefined,
      p_metadata: input.metadata,
      p_model_id: input.modelId,
      p_request_id: input.requestId,
      // Explicit null, never undefined: p_user_id has no default, so omitting it
      // makes PostgREST fail to resolve the function. A machine credential
      // genuinely has no user, and the column accepts NULL — the generated RPC
      // types just cannot express a nullable argument.
      p_user_id: input.actorId as unknown as string,
      p_ws_id: input.workspaceId,
    });

  const result = data?.[0];
  if (error || !result?.success || !result.run_id) {
    throw reservationError(result?.error_code ?? null);
  }

  return { runId: result.run_id };
}

export type SettleAiStudioRunInput = {
  actualCredits: number;
  embeddingUnits?: number;
  errorClass?: string | null;
  errorMessage?: string | null;
  firstTokenLatencyMs?: number | null;
  imageUnits?: number;
  inputTokens?: number;
  latencyMs?: number | null;
  metadata?: Json;
  outputTokens?: number;
  providerCostUsd?: number;
  reasoningTokens?: number;
  runId: string;
  status: 'aborted' | 'failed' | 'succeeded';
};

export async function settleAiStudioRun(
  input: SettleAiStudioRunInput
): Promise<void> {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('settle_ai_studio_run', {
      p_actual_credits: input.actualCredits,
      p_embedding_units: input.embeddingUnits ?? 0,
      p_error_class: input.errorClass ?? undefined,
      p_error_message: input.errorMessage ?? undefined,
      p_first_token_latency_ms: input.firstTokenLatencyMs ?? undefined,
      p_image_units: input.imageUnits ?? 0,
      p_input_tokens: input.inputTokens ?? 0,
      p_latency_ms: input.latencyMs ?? undefined,
      p_metadata: input.metadata,
      p_output_tokens: input.outputTokens ?? 0,
      p_provider_cost_usd: input.providerCostUsd ?? 0,
      p_reasoning_tokens: input.reasoningTokens ?? 0,
      p_run_id: input.runId,
      p_status: input.status,
    });

  if (error || !data?.[0]?.success) {
    console.error('AI Studio settlement RPC failed', {
      code: error?.code ?? null,
      errorCode: data?.[0]?.error_code ?? null,
      runId: input.runId,
    });
    throw new AiStudioError('AI usage could not be settled.', {
      code: 'server_error',
      status: 500,
      type: 'server_error',
    });
  }
}

export type SettleExternalAiStudioRunInput = Omit<
  SettleAiStudioRunInput,
  'actualCredits'
> & {
  /**
   * What this run would have billed had it been metered. Recorded, not charged,
   * so an app's consumption of its unmetered allocation is a reportable number
   * rather than an invisible zero.
   */
  unmeteredCredits?: number;
};

export async function settleExternalAiStudioRun(
  input: SettleExternalAiStudioRunInput
): Promise<void> {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('settle_external_ai_studio_run', {
      p_embedding_units: input.embeddingUnits ?? 0,
      p_error_class: input.errorClass ?? undefined,
      p_error_message: input.errorMessage ?? undefined,
      p_first_token_latency_ms: input.firstTokenLatencyMs ?? undefined,
      p_image_units: input.imageUnits ?? 0,
      p_input_tokens: input.inputTokens ?? 0,
      p_latency_ms: input.latencyMs ?? undefined,
      p_metadata: input.metadata,
      p_output_tokens: input.outputTokens ?? 0,
      p_provider_cost_usd: input.providerCostUsd ?? 0,
      p_reasoning_tokens: input.reasoningTokens ?? 0,
      p_run_id: input.runId,
      p_status: input.status,
      p_unmetered_credits: Math.max(0, input.unmeteredCredits ?? 0),
    });

  if (error || !data?.[0]?.success) {
    console.error('External-app AI Studio settlement RPC failed', {
      code: error?.code ?? null,
      errorCode: data?.[0]?.error_code ?? null,
      runId: input.runId,
    });
    throw new AiStudioError('External-app AI usage could not be settled.', {
      code: 'server_error',
      status: 500,
      type: 'server_error',
    });
  }
}
