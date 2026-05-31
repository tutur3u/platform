import { google } from '@ai-sdk/google';
import { embed } from 'ai';
import { checkAiCredits } from '../credits/check-credits.js';
import {
  commitMeteredEmbeddingCredits,
  releaseMeteredEmbeddingCredits,
  reserveMeteredEmbeddingCredits,
} from '../credits/reservations.js';

export const GEMINI_EMBEDDING_2_MODEL_ID = 'gemini-embedding-2';
export const GEMINI_EMBEDDING_2_GATEWAY_MODEL_ID = 'google/gemini-embedding-2';
export const GEMINI_EMBEDDING_2_DIMENSIONS = 3072;

const DEFAULT_COUNT_TOKENS_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models';

export type MeteredEmbeddingTaskType =
  | 'CLASSIFICATION'
  | 'CLUSTERING'
  | 'RETRIEVAL_DOCUMENT'
  | 'RETRIEVAL_QUERY'
  | 'SEMANTIC_SIMILARITY';

type MeteredEmbeddingSkipReason =
  | 'credit_check_failed'
  | 'credits_exhausted'
  | 'embedding_generation_failed'
  | 'empty_value'
  | 'invalid_embedding_shape'
  | 'missing_google_api_key'
  | 'missing_scope'
  | 'reservation_commit_failed'
  | 'reservation_failed'
  | 'token_count_failed';

export type MeteredEmbeddingResult =
  | {
      creditsDeducted: number;
      embedding: number[];
      inputTokens: number;
      modelId: string;
      ok: true;
      skipped?: false;
    }
  | {
      errorCode?: string | null;
      ok: false;
      reason: MeteredEmbeddingSkipReason | string;
      skipped: true;
      structuralDisable?: boolean;
    };

export type MeteredTextEmbeddingParams = {
  metadata?: Record<string, unknown>;
  source: string;
  taskType: MeteredEmbeddingTaskType;
  userId?: string | null;
  value: string;
  wsId?: string | null;
};

function isStructuralCreditError(errorCode?: string | null) {
  return [
    'CREDIT_CHECK_FAILED',
    'FEATURE_NOT_ALLOWED',
    'MODEL_DISABLED',
    'MODEL_NOT_ALLOWED',
    'MODEL_PRICING_UNAVAILABLE',
    'NO_ALLOCATION',
    'NO_BALANCE',
  ].includes(errorCode ?? '');
}

export function shouldDisableMemoryForMeteringReason(
  result: MeteredEmbeddingResult
) {
  if (result.ok) return false;
  return (
    result.structuralDisable ||
    ['missing_google_api_key', 'missing_scope'].includes(result.reason)
  );
}

function googleApiKey() {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ?? '';
}

async function countGeminiEmbeddingTokens({
  apiKey,
  modelId,
  value,
}: {
  apiKey: string;
  modelId: string;
  value: string;
}) {
  const endpoint = (
    process.env.GOOGLE_GENERATIVE_AI_COUNT_TOKENS_ENDPOINT ??
    DEFAULT_COUNT_TOKENS_ENDPOINT
  ).replace(/\/+$/u, '');
  const url = new URL(`${endpoint}/${modelId}:countTokens`);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url, {
    body: JSON.stringify({
      contents: [{ parts: [{ text: value }] }],
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`CountTokens failed with HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    totalTokens?: number;
    total_tokens?: number;
  };
  const totalTokens = Number(json.totalTokens ?? json.total_tokens ?? 0);
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    throw new Error('CountTokens returned no billable tokens');
  }

  return Math.ceil(totalTokens);
}

function skipped(
  reason: MeteredEmbeddingSkipReason | string,
  options?: { errorCode?: string | null; structuralDisable?: boolean }
): MeteredEmbeddingResult {
  return {
    ok: false,
    reason,
    skipped: true,
    ...(options?.errorCode ? { errorCode: options.errorCode } : {}),
    ...(options?.structuralDisable
      ? { structuralDisable: options.structuralDisable }
      : {}),
  };
}

export async function createMeteredTextEmbedding({
  metadata,
  source,
  taskType,
  userId,
  value,
  wsId,
}: MeteredTextEmbeddingParams): Promise<MeteredEmbeddingResult> {
  const text = value.trim();
  if (!text) return skipped('empty_value');
  if (!wsId || !userId) {
    return skipped('missing_scope', { structuralDisable: true });
  }

  const apiKey = googleApiKey();
  if (!apiKey) {
    return skipped('missing_google_api_key', { structuralDisable: true });
  }

  const creditCheck = await checkAiCredits(
    wsId,
    GEMINI_EMBEDDING_2_GATEWAY_MODEL_ID,
    'embeddings',
    { userId }
  );
  if (!creditCheck.allowed) {
    return skipped(
      creditCheck.errorCode === 'CREDITS_EXHAUSTED'
        ? 'credits_exhausted'
        : 'credit_check_failed',
      {
        errorCode: creditCheck.errorCode,
        structuralDisable: isStructuralCreditError(creditCheck.errorCode),
      }
    );
  }

  let inputTokens: number;
  try {
    inputTokens = await countGeminiEmbeddingTokens({
      apiKey,
      modelId: GEMINI_EMBEDDING_2_MODEL_ID,
      value: text,
    });
  } catch {
    return skipped('token_count_failed', { structuralDisable: false });
  }

  const reservation = await reserveMeteredEmbeddingCredits({
    inputTokens,
    metadata: {
      ...(metadata ?? {}),
      dimensions: GEMINI_EMBEDDING_2_DIMENSIONS,
      inputTokens,
      modelId: GEMINI_EMBEDDING_2_GATEWAY_MODEL_ID,
      source,
      taskType,
      userId,
      wsId,
    },
    modelId: GEMINI_EMBEDDING_2_GATEWAY_MODEL_ID,
    userId,
    wsId,
  });

  if (!reservation.success || !reservation.reservationId) {
    return skipped(
      reservation.errorCode === 'INSUFFICIENT_CREDITS'
        ? 'credits_exhausted'
        : 'reservation_failed',
      {
        errorCode: reservation.errorCode,
        structuralDisable: isStructuralCreditError(reservation.errorCode),
      }
    );
  }

  try {
    const result = await embed({
      model: google.embedding(GEMINI_EMBEDDING_2_MODEL_ID),
      providerOptions: {
        google: {
          outputDimensionality: GEMINI_EMBEDDING_2_DIMENSIONS,
          taskType,
        },
      },
      value: text,
    });

    if (
      !Array.isArray(result.embedding) ||
      result.embedding.length !== GEMINI_EMBEDDING_2_DIMENSIONS
    ) {
      await releaseMeteredEmbeddingCredits(reservation.reservationId, {
        reason: 'invalid_embedding_shape',
        source,
        userId,
        wsId,
      });
      return skipped('invalid_embedding_shape', { structuralDisable: false });
    }

    const commit = await commitMeteredEmbeddingCredits(
      reservation.reservationId,
      {
        actualInputTokens: result.usage.tokens ?? inputTokens,
        source,
        userId,
        wsId,
      }
    );
    if (!commit.success) {
      await releaseMeteredEmbeddingCredits(reservation.reservationId, {
        reason: 'reservation_commit_failed',
        source,
        userId,
        wsId,
      });
      return skipped('reservation_commit_failed', {
        errorCode: commit.errorCode,
        structuralDisable: false,
      });
    }

    return {
      creditsDeducted: commit.creditsDeducted,
      embedding: result.embedding,
      inputTokens,
      modelId: GEMINI_EMBEDDING_2_GATEWAY_MODEL_ID,
      ok: true,
    };
  } catch {
    await releaseMeteredEmbeddingCredits(reservation.reservationId, {
      reason: 'embedding_generation_failed',
      source,
      userId,
      wsId,
    });
    return skipped('embedding_generation_failed');
  }
}
