import type { GeminiLiveUsageSnapshot } from '@tuturuuu/internal-api';
import {
  type LiveSessionClaims,
  MEET_LIVE_MODEL,
} from '../../src/features/live-assistant/contracts';
import { type LiveEnvironment, liveDatabase } from './storage';
import { EMPTY_GEMINI_LIVE_USAGE } from './usage';

export type LiveBillingState = {
  id: string;
  sequence: number;
  usage: GeminiLiveUsageSnapshot;
  costUsd: number;
  incomplete: boolean;
  previousCostUsd?: number;
  openedAt?: number;
  pendingSettlement?: boolean;
  pendingShareFinish?: string;
};
export async function beginLiveBilling(
  env: LiveEnvironment,
  claims: LiveSessionClaims,
  previousCostUsd = 0,
  accessWorkspaceId = claims.billingWorkspaceId
): Promise<LiveBillingState> {
  const rows = await liveDatabase<
    Array<{ success: boolean; live_session_id?: string; error_code?: string }>
  >(env, 'rpc/begin_ai_live_session', {
    method: 'POST',
    schema: 'private',
    body: {
      p_access_ws_id: accessWorkspaceId,
      p_billing_ws_id: claims.billingWorkspaceId,
      p_expires_at: new Date(Date.now() + 9 * 60_000).toISOString(),
      p_model_id: MEET_LIVE_MODEL,
      p_user_id: claims.ownerId,
    },
  });
  if (!rows[0]?.success || !rows[0].live_session_id)
    throw new Error(rows[0]?.error_code ?? 'live_billing_failed');
  return {
    id: rows[0].live_session_id,
    sequence: 0,
    usage: { ...EMPTY_GEMINI_LIVE_USAGE },
    costUsd: previousCostUsd,
    previousCostUsd,
    openedAt: Date.now(),
    incomplete: true,
  };
}
export async function settleLiveBilling(
  env: LiveEnvironment,
  claims: LiveSessionClaims,
  state: LiveBillingState,
  close: boolean
) {
  const sequence = state.sequence + 1;
  const rows = await liveDatabase<
    Array<{
      success: boolean;
      provider_cost_usd?: number;
      closed?: boolean;
      remaining_reserved_credits?: number;
    }>
  >(env, 'rpc/settle_ai_live_session', {
    method: 'POST',
    schema: 'private',
    body: {
      p_close: close,
      p_live_session_id: state.id,
      p_sequence: sequence,
      p_usage: state.usage,
      p_user_id: claims.ownerId,
    },
  });
  const row = rows[0];
  if (!row?.success) throw new Error('live_settlement_failed');
  return {
    ...state,
    sequence,
    costUsd:
      row.provider_cost_usd === undefined
        ? state.costUsd
        : (state.previousCostUsd ?? 0) + Number(row.provider_cost_usd),
    closed: row.closed === true,
    exhausted: Number(row.remaining_reserved_credits ?? 0) <= 0,
    renew:
      Number(row.remaining_reserved_credits ?? 0) <= 300 ||
      Date.now() - (state.openedAt ?? 0) >= 8 * 60_000,
  };
}
