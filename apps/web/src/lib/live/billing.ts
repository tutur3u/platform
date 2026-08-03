import type { GeminiLiveUsageSnapshot } from '@tuturuuu/internal-api';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

type PrivateRpcResult<T> = {
  data: T[] | null;
  error: { code?: string; message?: string } | null;
};

export class LiveBillingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'LiveBillingError';
  }
}

export async function beginLiveBillingSession({
  accessWsId,
  billingWsId,
  expiresAt,
  model,
  userId,
}: {
  accessWsId: string;
  billingWsId: string;
  expiresAt: string;
  model: string;
  userId: string;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const privateClient = sbAdmin.schema('private') as unknown as {
    rpc: (
      fn: 'begin_ai_live_session',
      args: Record<string, unknown>
    ) => Promise<
      PrivateRpcResult<{
        error_code?: string | null;
        live_session_id?: string;
        reservation_id?: string;
        reserved_credits?: number | string;
        success?: boolean;
      }>
    >;
  };
  const { data, error } = await privateClient.rpc('begin_ai_live_session', {
    p_access_ws_id: accessWsId,
    p_billing_ws_id: billingWsId,
    p_expires_at: expiresAt,
    p_model_id: model,
    p_user_id: userId,
  });
  const row = data?.[0];

  if (error || !row?.success || !row.live_session_id || !row.reservation_id) {
    const code = row?.error_code ?? 'LIVE_BILLING_FAILED';
    console.error('Failed to create Live billing session', {
      code: error?.code ?? null,
      errorCode: row?.error_code ?? null,
    });
    throw new LiveBillingError(
      code === 'INSUFFICIENT_CREDITS' || code === 'CREDITS_EXHAUSTED'
        ? 'At least 500 AI credits are required to start Live mode.'
        : 'Unable to initialize Live billing.',
      code,
      code === 'INSUFFICIENT_CREDITS' || code === 'CREDITS_EXHAUSTED'
        ? 402
        : code === 'MODEL_NOT_ALLOWED' || code === 'FEATURE_NOT_ALLOWED'
          ? 403
          : 500
    );
  }

  return {
    liveSessionId: row.live_session_id,
    reservationId: row.reservation_id,
    reservedCredits: Number(row.reserved_credits ?? 0),
  };
}

export async function settleLiveBillingSession({
  close,
  liveSessionId,
  sequence,
  usage,
  userId,
}: {
  close: boolean;
  liveSessionId: string;
  sequence: number;
  usage: GeminiLiveUsageSnapshot;
  userId: string;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const privateClient = sbAdmin.schema('private') as unknown as {
    rpc: (
      fn: 'settle_ai_live_session',
      args: Record<string, unknown>
    ) => Promise<
      PrivateRpcResult<{
        billed_credits?: number | string;
        closed?: boolean;
        error_code?: string | null;
        provider_cost_usd?: number | string;
        remaining_reserved_credits?: number | string;
        success?: boolean;
      }>
    >;
  };
  const { data, error } = await privateClient.rpc('settle_ai_live_session', {
    p_close: close,
    p_live_session_id: liveSessionId,
    p_sequence: sequence,
    p_usage: usage,
    p_user_id: userId,
  });
  const row = data?.[0];

  if (error || !row?.success) {
    console.error('Failed to settle Live usage', {
      code: error?.code ?? null,
      errorCode: row?.error_code ?? null,
      liveSessionId,
    });
    throw new LiveBillingError(
      'Unable to record Live usage.',
      row?.error_code ?? 'LIVE_SETTLEMENT_FAILED',
      row?.error_code === 'LIVE_SESSION_NOT_FOUND' ? 404 : 400
    );
  }

  return {
    billedCredits: Number(row.billed_credits ?? 0),
    closed: row.closed ?? false,
    providerCostUsd: Number(row.provider_cost_usd ?? 0),
    remainingReservedCredits: Number(row.remaining_reserved_credits ?? 0),
  };
}

export async function abortLiveBillingSession({
  liveSessionId,
  userId,
}: {
  liveSessionId: string;
  userId: string;
}) {
  return settleLiveBillingSession({
    close: true,
    liveSessionId,
    sequence: 0,
    usage: {
      inputAudioTokens: 0,
      inputImageTokens: 0,
      inputTextTokens: 0,
      inputVideoTokens: 0,
      outputAudioTokens: 0,
      outputTextTokens: 0,
      searchQueries: 0,
      thinkingTokens: 0,
    },
    userId,
  });
}
