import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import {
  decrementAiCreditChargeInFlight,
  incrementAiCreditChargeInFlight,
  invalidateAiCreditSnapshot,
} from '@tuturuuu/utils/ai-temp-auth';
import type { AiFeature } from './constants.js';
import { resolveGatewayModelId } from './model-mapping.js';
import type {
  CreditReservationCommitResult,
  CreditReservationReleaseResult,
  CreditReservationResult,
  MeteredEmbeddingReservationResult,
} from './types.js';

type ReserveFixedCreditsRpcParams = {
  p_ws_id: string;
  p_user_id?: string | null;
  p_amount: number;
  p_model_id: string;
  p_feature: string;
  p_metadata: Json;
  p_expires_in_seconds?: number;
};

type ReserveFixedCreditsRpcRow = {
  success?: boolean;
  reservation_id?: string | null;
  remaining_credits?: number | string;
  error_code?: string | null;
};

type CommitFixedCreditReservationRpcParams = {
  p_reservation_id: string;
  p_metadata: Json;
};

type CommitFixedCreditReservationRpcRow = {
  success?: boolean;
  credits_deducted?: number | string;
  remaining_credits?: number | string;
  error_code?: string | null;
};

type ReleaseFixedCreditReservationRpcParams = {
  p_reservation_id: string;
  p_metadata: Json;
};

type ReleaseFixedCreditReservationRpcRow = {
  success?: boolean;
  remaining_credits?: number | string;
  error_code?: string | null;
};

type ReserveMeteredEmbeddingCreditsRpcParams = {
  p_ws_id: string;
  p_user_id?: string | null;
  p_model_id: string;
  p_input_tokens: number;
  p_feature?: string;
  p_metadata: Json;
  p_expires_in_seconds?: number;
};

type ReserveMeteredEmbeddingCreditsRpcRow = {
  success?: boolean;
  reservation_id?: string | null;
  credits_reserved?: number | string;
  cost_usd?: number | string;
  remaining_credits?: number | string;
  error_code?: string | null;
};

type CommitMeteredEmbeddingCreditsRpcParams = {
  p_reservation_id: string;
  p_metadata: Json;
};

type ReleaseMeteredEmbeddingCreditsRpcParams = {
  p_reservation_id: string;
  p_metadata: Json;
};

type RpcError = { message: string } | null;

type CreditReservationRpcCaller = {
  rpc: unknown;
};

async function getRpcCaller(
  rpcCaller?: CreditReservationRpcCaller
): Promise<CreditReservationRpcCaller> {
  if (rpcCaller) {
    return rpcCaller;
  }

  return createAdminClient();
}

function rpcErrorFromUnknown(error: unknown): RpcError {
  return {
    message: error instanceof Error ? error.message : 'Unknown RPC failure',
  };
}

export async function reserveFixedAiCredits(
  params: {
    wsId: string;
    userId?: string;
    amount: number;
    modelId: string;
    feature: AiFeature;
    metadata?: Record<string, unknown>;
    expiresInSeconds?: number;
  },
  rpcCaller?: CreditReservationRpcCaller
): Promise<CreditReservationResult> {
  const sbAdmin = await getRpcCaller(rpcCaller);
  const gatewayModelId = resolveGatewayModelId(params.modelId);
  let inFlightMarked = false;
  const rpc = (sbAdmin.rpc as (...args: unknown[]) => unknown).bind(
    sbAdmin
  ) as (
    fn: 'reserve_fixed_ai_credits',
    args: ReserveFixedCreditsRpcParams
  ) => Promise<{
    data: ReserveFixedCreditsRpcRow[] | null;
    error: RpcError;
  }>;

  if (params.userId) {
    inFlightMarked = await incrementAiCreditChargeInFlight({
      wsId: params.wsId,
      userId: params.userId,
    });
  }

  let data: ReserveFixedCreditsRpcRow[] | null = null;
  let error: RpcError = null;
  try {
    const result = await rpc('reserve_fixed_ai_credits', {
      p_ws_id: params.wsId,
      p_user_id: params.userId ?? null,
      p_amount: params.amount,
      p_model_id: gatewayModelId,
      p_feature: params.feature,
      p_metadata: (params.metadata ?? {}) as Json,
      ...((params.expiresInSeconds ?? 0) > 0
        ? { p_expires_in_seconds: params.expiresInSeconds }
        : {}),
    });
    data = result.data;
    error = result.error;
  } catch (caughtError) {
    data = null;
    error = rpcErrorFromUnknown(caughtError);
  } finally {
    if (inFlightMarked && params.userId) {
      await decrementAiCreditChargeInFlight({
        wsId: params.wsId,
        userId: params.userId,
      });
    }
  }

  if (error) {
    console.error('Error reserving AI credits:', error);
    return {
      success: false,
      reservationId: null,
      remainingCredits: 0,
      errorCode: 'RESERVATION_FAILED',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      success: false,
      reservationId: null,
      remainingCredits: 0,
      errorCode: 'NO_RESULT',
    };
  }

  return {
    success: row.success ?? false,
    reservationId: row.reservation_id ?? null,
    remainingCredits: Number(row.remaining_credits ?? 0),
    errorCode: row.error_code ?? null,
  };
}

export async function reserveMeteredEmbeddingCredits(
  params: {
    expiresInSeconds?: number;
    inputTokens: number;
    metadata?: Record<string, unknown>;
    modelId: string;
    userId?: string | null;
    wsId: string;
  },
  rpcCaller?: CreditReservationRpcCaller
): Promise<MeteredEmbeddingReservationResult> {
  const sbAdmin = await getRpcCaller(rpcCaller);
  const gatewayModelId = resolveGatewayModelId(params.modelId);
  const rpc = (sbAdmin.rpc as (...args: unknown[]) => unknown).bind(
    sbAdmin
  ) as (
    fn: 'reserve_metered_embedding_credits',
    args: ReserveMeteredEmbeddingCreditsRpcParams
  ) => Promise<{
    data: ReserveMeteredEmbeddingCreditsRpcRow[] | null;
    error: RpcError;
  }>;

  let data: ReserveMeteredEmbeddingCreditsRpcRow[] | null = null;
  let error: RpcError = null;
  try {
    const result = await rpc('reserve_metered_embedding_credits', {
      p_ws_id: params.wsId,
      p_user_id: params.userId ?? null,
      p_model_id: gatewayModelId,
      p_input_tokens: params.inputTokens,
      p_feature: 'embeddings',
      p_metadata: (params.metadata ?? {}) as Json,
      ...((params.expiresInSeconds ?? 0) > 0
        ? { p_expires_in_seconds: params.expiresInSeconds }
        : {}),
    });
    data = result.data;
    error = result.error;
  } catch (caughtError) {
    data = null;
    error = rpcErrorFromUnknown(caughtError);
  }

  if (error) {
    console.error('Error reserving metered embedding credits:', error);
    return {
      success: false,
      reservationId: null,
      creditsReserved: 0,
      costUsd: 0,
      remainingCredits: 0,
      errorCode: 'RESERVATION_FAILED',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      success: false,
      reservationId: null,
      creditsReserved: 0,
      costUsd: 0,
      remainingCredits: 0,
      errorCode: 'NO_RESULT',
    };
  }

  return {
    success: row.success ?? false,
    reservationId: row.reservation_id ?? null,
    creditsReserved: Number(row.credits_reserved ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
    remainingCredits: Number(row.remaining_credits ?? 0),
    errorCode: row.error_code ?? null,
  };
}

export async function commitMeteredEmbeddingCredits(
  reservationId: string,
  metadata?: Record<string, unknown>,
  rpcCaller?: CreditReservationRpcCaller
): Promise<CreditReservationCommitResult> {
  const sbAdmin = await getRpcCaller(rpcCaller);
  const wsId = typeof metadata?.wsId === 'string' ? metadata.wsId : null;
  const userId = typeof metadata?.userId === 'string' ? metadata.userId : null;
  const rpc = (sbAdmin.rpc as (...args: unknown[]) => unknown).bind(
    sbAdmin
  ) as (
    fn: 'commit_metered_embedding_credits',
    args: CommitMeteredEmbeddingCreditsRpcParams
  ) => Promise<{
    data: CommitFixedCreditReservationRpcRow[] | null;
    error: RpcError;
  }>;

  let data: CommitFixedCreditReservationRpcRow[] | null = null;
  let error: RpcError = null;
  try {
    const result = await rpc('commit_metered_embedding_credits', {
      p_reservation_id: reservationId,
      p_metadata: (metadata ?? {}) as Json,
    });
    data = result.data;
    error = result.error;
  } catch (caughtError) {
    data = null;
    error = rpcErrorFromUnknown(caughtError);
  }

  if (error) {
    console.error('Error committing metered embedding credits:', error);
    return {
      success: false,
      creditsDeducted: 0,
      remainingCredits: 0,
      errorCode: 'COMMIT_FAILED',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      success: false,
      creditsDeducted: 0,
      remainingCredits: 0,
      errorCode: 'NO_RESULT',
    };
  }

  const result = {
    success: row.success ?? false,
    creditsDeducted: Number(row.credits_deducted ?? 0),
    remainingCredits: Number(row.remaining_credits ?? 0),
    errorCode: row.error_code ?? null,
  };

  if (result.success && wsId && userId) {
    await invalidateAiCreditSnapshot({ wsId, userId });
  }

  return result;
}

export async function releaseMeteredEmbeddingCredits(
  reservationId: string,
  metadata?: Record<string, unknown>,
  rpcCaller?: CreditReservationRpcCaller
): Promise<CreditReservationReleaseResult> {
  const sbAdmin = await getRpcCaller(rpcCaller);
  const rpc = (sbAdmin.rpc as (...args: unknown[]) => unknown).bind(
    sbAdmin
  ) as (
    fn: 'release_metered_embedding_credits',
    args: ReleaseMeteredEmbeddingCreditsRpcParams
  ) => Promise<{
    data: ReleaseFixedCreditReservationRpcRow[] | null;
    error: RpcError;
  }>;

  let data: ReleaseFixedCreditReservationRpcRow[] | null = null;
  let error: RpcError = null;
  try {
    const result = await rpc('release_metered_embedding_credits', {
      p_reservation_id: reservationId,
      p_metadata: (metadata ?? {}) as Json,
    });
    data = result.data;
    error = result.error;
  } catch (caughtError) {
    data = null;
    error = rpcErrorFromUnknown(caughtError);
  }

  if (error) {
    console.error('Error releasing metered embedding credits:', error);
    return {
      success: false,
      remainingCredits: 0,
      errorCode: 'RELEASE_FAILED',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      success: false,
      remainingCredits: 0,
      errorCode: 'NO_RESULT',
    };
  }

  return {
    success: row.success ?? false,
    remainingCredits: Number(row.remaining_credits ?? 0),
    errorCode: row.error_code ?? null,
  };
}

export async function commitFixedAiCreditReservation(
  reservationId: string,
  metadata?: Record<string, unknown>,
  rpcCaller?: CreditReservationRpcCaller
): Promise<CreditReservationCommitResult> {
  const sbAdmin = await getRpcCaller(rpcCaller);
  const wsId = typeof metadata?.wsId === 'string' ? metadata.wsId : null;
  const userId = typeof metadata?.userId === 'string' ? metadata.userId : null;
  let inFlightMarked = false;
  const rpc = (sbAdmin.rpc as (...args: unknown[]) => unknown).bind(
    sbAdmin
  ) as (
    fn: 'commit_fixed_ai_credit_reservation',
    args: CommitFixedCreditReservationRpcParams
  ) => Promise<{
    data: CommitFixedCreditReservationRpcRow[] | null;
    error: RpcError;
  }>;

  if (wsId && userId) {
    inFlightMarked = await incrementAiCreditChargeInFlight({ wsId, userId });
  }

  let data: CommitFixedCreditReservationRpcRow[] | null = null;
  let error: RpcError = null;
  try {
    const result = await rpc('commit_fixed_ai_credit_reservation', {
      p_reservation_id: reservationId,
      p_metadata: (metadata ?? {}) as Json,
    });
    data = result.data;
    error = result.error;
  } catch (caughtError) {
    data = null;
    error = rpcErrorFromUnknown(caughtError);
  } finally {
    if (inFlightMarked && wsId && userId) {
      await decrementAiCreditChargeInFlight({ wsId, userId });
    }
  }

  if (error) {
    console.error('Error committing AI credit reservation:', error);
    return {
      success: false,
      creditsDeducted: 0,
      remainingCredits: 0,
      errorCode: 'COMMIT_FAILED',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      success: false,
      creditsDeducted: 0,
      remainingCredits: 0,
      errorCode: 'NO_RESULT',
    };
  }

  const result = {
    success: row.success ?? false,
    creditsDeducted: Number(row.credits_deducted ?? 0),
    remainingCredits: Number(row.remaining_credits ?? 0),
    errorCode: row.error_code ?? null,
  };

  if (result.success && wsId && userId) {
    await invalidateAiCreditSnapshot({ wsId, userId });
  }

  return result;
}

export async function releaseFixedAiCreditReservation(
  reservationId: string,
  metadata?: Record<string, unknown>,
  rpcCaller?: CreditReservationRpcCaller
): Promise<CreditReservationReleaseResult> {
  const sbAdmin = await getRpcCaller(rpcCaller);
  const rpc = (sbAdmin.rpc as (...args: unknown[]) => unknown).bind(
    sbAdmin
  ) as (
    fn: 'release_fixed_ai_credit_reservation',
    args: ReleaseFixedCreditReservationRpcParams
  ) => Promise<{
    data: ReleaseFixedCreditReservationRpcRow[] | null;
    error: RpcError;
  }>;

  const { data, error } = await rpc('release_fixed_ai_credit_reservation', {
    p_reservation_id: reservationId,
    p_metadata: (metadata ?? {}) as Json,
  });

  if (error) {
    console.error('Error releasing AI credit reservation:', error);
    return {
      success: false,
      remainingCredits: 0,
      errorCode: 'RELEASE_FAILED',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      success: false,
      remainingCredits: 0,
      errorCode: 'NO_RESULT',
    };
  }

  return {
    success: row.success ?? false,
    remainingCredits: Number(row.remaining_credits ?? 0),
    errorCode: row.error_code ?? null,
  };
}
