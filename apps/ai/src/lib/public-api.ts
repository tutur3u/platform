import { AiStudioError, toOpenAiError } from '@tuturuuu/ai/studio/errors';
import {
  beginAiStudioRun,
  beginExternalAiStudioRun,
  calculateAiStudioUsageCost,
  recordAiStudioRunStep,
  settleAiStudioRun,
  settleExternalAiStudioRun,
} from '@tuturuuu/ai/studio/metering';
import {
  getAiStudioRequestId,
  getIdempotencyKey,
} from '@tuturuuu/ai/studio/request';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import {
  authenticatePublicAiRequest,
  EXTERNAL_AI_SCOPE,
  type PublicAiCredential,
} from './public-credential';

export { authenticatePublicAiRequest } from './public-credential';

export type MeteredUsage = {
  embeddingUnits?: number;
  imageUnits?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
};

export type MeteredExecutionContext = {
  credential: PublicAiCredential;
  modelId: string;
  requestId: string;
  runId: string;
  startedAt: number;
};

type ErrorDetails = {
  causeCode: string | null;
  causeName: string | null;
  code: string | null;
  name: string;
  statusCode: number | null;
};

type PrepareMeteredExecutionInput = {
  feature: string;
  maxUsage: MeteredUsage;
  metadata?: Json;
  modelId: string;
  request: Request;
  credential?: PublicAiCredential;
  requiredModelType?: string;
  requiredExternalScope?: string;
};

/**
 * Decides whether a request belongs to a registered external app.
 *
 * Two credentials reach the same place: a user's app-session token (interactive)
 * and an API key bound to the app (background workers, which have no session).
 * Both must be attributed to the app and settle unmetered, otherwise the same
 * workload would be billed differently depending on who triggered it.
 */
export function externalAppAttribution(credential: PublicAiCredential): {
  actorId: string | null;
  apiKeyId: string | null;
  appId: string;
} | null {
  if (credential.kind === 'external-app') {
    return {
      actorId: credential.actorId,
      apiKeyId: null,
      appId: credential.appId,
    };
  }

  const boundAppId = credential.apiKey.external_app_id?.trim();
  if (!boundAppId) return null;

  return {
    actorId: credential.actorId ?? null,
    apiKeyId: credential.apiKey.id,
    appId: boundAppId,
  };
}

/**
 * Only reached when `externalAppAttribution` returned null, which by construction
 * means an unbound API key. The guard keeps that invariant checkable rather than
 * silently substituting an empty id if the union ever gains a third member.
 */
function apiKeyIdForMeteredRun(credential: PublicAiCredential): string {
  if (credential.kind !== 'api-key') {
    throw new AiStudioError('This credential cannot start a metered run.', {
      code: 'server_error',
      status: 500,
      type: 'server_error',
    });
  }
  return credential.apiKey.id;
}

function positiveReservation(value: number): number {
  return Math.max(0.0001, value);
}

function stringProperty(value: unknown, property: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const propertyValue = Reflect.get(value, property);
  return typeof propertyValue === 'string' ? propertyValue : null;
}

function numberProperty(value: unknown, property: string): number | null {
  if (!value || typeof value !== 'object') return null;
  const propertyValue = Reflect.get(value, property);
  return typeof propertyValue === 'number' ? propertyValue : null;
}

export function describeAiStudioRuntimeError(error: unknown): ErrorDetails {
  const cause =
    error && typeof error === 'object' ? Reflect.get(error, 'cause') : null;
  return {
    causeCode: stringProperty(cause, 'code'),
    causeName:
      cause instanceof Error ? cause.name : stringProperty(cause, 'name'),
    code: stringProperty(error, 'code'),
    name:
      error instanceof Error
        ? error.name
        : (stringProperty(error, 'name') ?? typeof error),
    statusCode:
      numberProperty(error, 'statusCode') ?? numberProperty(error, 'status'),
  };
}

export function approximateTokenCount(value: unknown): number {
  const serialized =
    typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return Math.max(1, Math.ceil(serialized.length / 4));
}

export async function prepareMeteredExecution({
  credential: providedCredential,
  feature,
  maxUsage,
  metadata,
  modelId,
  request,
  requiredModelType,
  requiredExternalScope = EXTERNAL_AI_SCOPE,
}: PrepareMeteredExecutionInput): Promise<MeteredExecutionContext> {
  const credential =
    providedCredential ??
    (await authenticatePublicAiRequest(request, requiredExternalScope));
  if (requiredModelType) {
    await assertAiStudioModelType(modelId, requiredModelType);
  }
  const requestId = getAiStudioRequestId(request);
  const estimatedCost = await calculateAiStudioUsageCost({
    imageCount: maxUsage.imageUnits,
    inputTokens: maxUsage.inputTokens,
    modelId,
    outputTokens: maxUsage.outputTokens,
    reasoningTokens: maxUsage.reasoningTokens,
    workspaceId: credential.workspaceId,
  });

  const idempotencyKey = getIdempotencyKey(request);
  const externalApp = externalAppAttribution(credential);

  // An API key with no app binding is the only credential that spends workspace
  // credits. Everything belonging to a registered app — a user's session token or
  // a key bound to that app — is attributed to the app and settles unmetered.
  const reservation = externalApp
    ? await beginExternalAiStudioRun({
        actorId: externalApp.actorId,
        apiKeyId: externalApp.apiKeyId,
        externalAppId: externalApp.appId,
        feature,
        idempotencyKey: idempotencyKey
          ? `${externalApp.appId}:${idempotencyKey}`
          : null,
        metadata,
        modelId,
        requestId,
        workspaceId: credential.workspaceId,
      })
    : await beginAiStudioRun({
        actorId: credential.actorId,
        apiKeyId: apiKeyIdForMeteredRun(credential),
        feature,
        idempotencyKey,
        metadata,
        modelId,
        requestId,
        reservedCredits: positiveReservation(estimatedCost.billedCredits),
        workspaceId: credential.workspaceId,
      });

  return {
    credential,
    modelId,
    requestId,
    runId: reservation.runId,
    startedAt: Date.now(),
  };
}

async function assertAiStudioModelType(modelId: string, requiredType: string) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: model, error } = await sbAdmin
    .schema('private')
    .from('ai_gateway_models')
    .select('type')
    .eq('id', modelId)
    .eq('is_enabled', true)
    .maybeSingle();

  if (error) {
    throw new AiStudioError('The selected model could not be validated.', {
      code: 'server_error',
      status: 500,
      type: 'server_error',
    });
  }

  if (model && model.type !== requiredType) {
    const message =
      requiredType === 'language'
        ? `The selected ${model.type} model cannot generate text. Choose a language model and try again.`
        : `The selected ${model.type} model cannot run a ${requiredType} request. Choose a ${requiredType} model and try again.`;
    throw new AiStudioError(message, {
      code: 'invalid_request_error',
      status: 400,
    });
  }
}

export async function settleMeteredExecution(
  context: MeteredExecutionContext,
  {
    error,
    firstTokenLatencyMs,
    metadata,
    status,
    usage,
  }: {
    error?: unknown;
    firstTokenLatencyMs?: number | null;
    metadata?: Json;
    status: 'aborted' | 'failed' | 'succeeded';
    usage: MeteredUsage;
  }
): Promise<void> {
  const cost = await calculateAiStudioUsageCost({
    imageCount: usage.imageUnits,
    inputTokens: usage.inputTokens,
    modelId: context.modelId,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    workspaceId: context.credential.workspaceId,
  }).catch(() => ({ billedCredits: 0, providerCostUsd: 0 }));

  const settlement = {
    embeddingUnits: usage.embeddingUnits,
    errorClass: error instanceof Error ? error.name : null,
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : null,
    firstTokenLatencyMs,
    imageUnits: usage.imageUnits,
    inputTokens: usage.inputTokens,
    latencyMs: Date.now() - context.startedAt,
    metadata,
    outputTokens: usage.outputTokens,
    providerCostUsd: cost.providerCostUsd,
    reasoningTokens: usage.reasoningTokens,
    runId: context.runId,
    status,
  };

  if (externalAppAttribution(context.credential)) {
    await settleExternalAiStudioRun(settlement);
  } else {
    await settleAiStudioRun({
      ...settlement,
      actualCredits: cost.billedCredits,
    });
  }
}

export async function recordMeteredExecutionStep(
  context: MeteredExecutionContext,
  input: {
    errorClass?: string | null;
    inputTokens?: number;
    kind: 'model' | 'tool';
    latencyMs?: number | null;
    metadata?: Json;
    name: string;
    outputTokens?: number;
    sequence: number;
    startedAt?: string;
    status: 'aborted' | 'failed' | 'running' | 'succeeded';
  }
): Promise<void> {
  const cost =
    input.kind === 'model'
      ? await calculateAiStudioUsageCost({
          inputTokens: input.inputTokens,
          modelId: context.modelId,
          outputTokens: input.outputTokens,
          workspaceId: context.credential.workspaceId,
        }).catch(() => ({ billedCredits: 0, providerCostUsd: 0 }))
      : { billedCredits: 0, providerCostUsd: 0 };

  await recordAiStudioRunStep({
    ...input,
    billedCredits: externalAppAttribution(context.credential)
      ? 0
      : cost.billedCredits,
    modelId: input.kind === 'model' ? context.modelId : null,
    providerCostUsd: cost.providerCostUsd,
    runId: context.runId,
  });
}

export async function captureAiStudioContent(
  context: MeteredExecutionContext,
  {
    output,
    prompt,
  }: {
    output?: Json;
    prompt?: Json;
  }
): Promise<void> {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const [{ data: global }, { data: policy }] = await Promise.all([
    sbAdmin
      .schema('private')
      .from('ai_studio_global_settings')
      .select('capture_default_enabled, content_retention_days')
      .eq('singleton', true)
      .maybeSingle(),
    sbAdmin
      .schema('private')
      .from('workspace_ai_studio_policies')
      .select('capture_enabled, content_retention_days')
      .eq('ws_id', context.credential.workspaceId)
      .maybeSingle(),
  ]);

  const captureEnabled =
    policy?.capture_enabled ?? global?.capture_default_enabled ?? false;
  if (!captureEnabled) return;

  const retentionDays =
    policy?.content_retention_days ?? global?.content_retention_days ?? 30;
  const expiresAt = new Date(
    Date.now() + retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await sbAdmin
    .schema('private')
    .from('ai_studio_run_content')
    .upsert({
      expires_at: expiresAt,
      output,
      prompt,
      run_id: context.runId,
    });

  if (error) {
    console.warn('Failed to capture optional AI Studio content', {
      code: error.code,
      runId: context.runId,
    });
  }
}

export async function listAllowedModels(credential: PublicAiCredential) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: models, error } = await sbAdmin
    .schema('private')
    .from('ai_gateway_models')
    .select('id, name, provider, type, context_window, max_tokens, tags')
    .eq('is_enabled', true)
    .order('name');

  if (error) {
    throw new AiStudioError('The model catalog could not be loaded.', {
      code: 'server_error',
      status: 500,
      type: 'server_error',
    });
  }

  const allowed = await Promise.all(
    (models ?? []).map(async (model) => {
      const { data } = await sbAdmin
        .schema('private')
        .rpc('ai_studio_model_allowed', {
          p_api_key_id:
            credential.kind === 'api-key'
              ? credential.apiKey.id
              : (null as unknown as string),
          p_model_id: model.id,
          p_ws_id: credential.workspaceId,
        });
      return data ? model : null;
    })
  );

  return allowed.filter((model): model is NonNullable<typeof model> =>
    Boolean(model)
  );
}

export function publicApiError(error: unknown, requestId?: string): Response {
  console.error('AI Studio public API request failed', {
    ...describeAiStudioRuntimeError(error),
    requestId,
  });
  return toOpenAiError(error, requestId);
}
