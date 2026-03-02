import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import type { AiFeature } from './constants';
import { resolveGatewayModelId } from './model-mapping';
import type {
  CreditReservationCommitResult,
  CreditReservationReleaseResult,
  CreditReservationResult,
} from './types';

type ReserveFixedCreditsRpcParams = {
  p_ws_id: string;
  p_user_id: string;
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

export async function reserveFixedAiCredits(
  params: {
    wsId: string;
    userId: string;
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
  const rpc = (sbAdmin.rpc as (...args: unknown[]) => unknown).bind(
    sbAdmin
  ) as (
    fn: 'reserve_fixed_ai_credits',
    args: ReserveFixedCreditsRpcParams
  ) => Promise<{
    data: ReserveFixedCreditsRpcRow[] | null;
    error: RpcError;
  }>;

  const { data, error } = await rpc('reserve_fixed_ai_credits', {
    p_ws_id: params.wsId,
    p_user_id: params.userId,
    p_amount: params.amount,
    p_model_id: gatewayModelId,
    p_feature: params.feature,
    p_metadata: (params.metadata ?? {}) as Json,
    ...((params.expiresInSeconds ?? 0) > 0
      ? { p_expires_in_seconds: params.expiresInSeconds }
      : {}),
  });

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

export async function commitFixedAiCreditReservation(
  reservationId: string,
  metadata?: Record<string, unknown>,
  rpcCaller?: CreditReservationRpcCaller
): Promise<CreditReservationCommitResult> {
  const sbAdmin = await getRpcCaller(rpcCaller);
  const rpc = (sbAdmin.rpc as (...args: unknown[]) => unknown).bind(
    sbAdmin
  ) as (
    fn: 'commit_fixed_ai_credit_reservation',
    args: CommitFixedCreditReservationRpcParams
  ) => Promise<{
    data: CommitFixedCreditReservationRpcRow[] | null;
    error: RpcError;
  }>;

  const { data, error } = await rpc('commit_fixed_ai_credit_reservation', {
    p_reservation_id: reservationId,
    p_metadata: (metadata ?? {}) as Json,
  });

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

  return {
    success: row.success ?? false,
    creditsDeducted: Number(row.credits_deducted ?? 0),
    remainingCredits: Number(row.remaining_credits ?? 0),
    errorCode: row.error_code ?? null,
  };
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
