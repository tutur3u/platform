import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

import {
  beginLiveBillingSession,
  type LiveBillingError,
  settleLiveBillingSession,
} from './billing';

const usage = {
  inputAudioTokens: 10,
  inputImageTokens: 0,
  inputTextTokens: 20,
  inputVideoTokens: 0,
  outputAudioTokens: 30,
  outputTextTokens: 40,
  searchQueries: 1,
  thinkingTokens: 5,
};

describe('Live billing service', () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({
      schema: vi.fn(() => ({ rpc })),
    });
  });

  it('creates the allowance, reservation, and billing session atomically', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          live_session_id: 'live-1',
          reservation_id: 'reservation-1',
          reserved_credits: '2000',
          success: true,
        },
      ],
      error: null,
    });

    await expect(
      beginLiveBillingSession({
        accessWsId: 'access-1',
        billingWsId: 'billing-1',
        expiresAt: '2026-08-03T12:05:00.000Z',
        model: 'gemini-3.1-flash-live-preview',
        userId: 'user-1',
      })
    ).resolves.toEqual({
      liveSessionId: 'live-1',
      reservationId: 'reservation-1',
      reservedCredits: 2_000,
    });
    expect(rpc).toHaveBeenCalledWith('begin_ai_live_session', {
      p_access_ws_id: 'access-1',
      p_billing_ws_id: 'billing-1',
      p_expires_at: '2026-08-03T12:05:00.000Z',
      p_model_id: 'gemini-3.1-flash-live-preview',
      p_user_id: 'user-1',
    });
  });

  it('requires at least 500 available credits', async () => {
    rpc.mockResolvedValue({
      data: [{ error_code: 'INSUFFICIENT_CREDITS', success: false }],
      error: null,
    });

    await expect(
      beginLiveBillingSession({
        accessWsId: 'access-1',
        billingWsId: 'billing-1',
        expiresAt: '2026-08-03T12:05:00.000Z',
        model: 'gemini-3.1-flash-live-preview',
        userId: 'user-1',
      })
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
      status: 402,
    } satisfies Partial<LiveBillingError>);
  });

  it('passes cumulative usage and sequence to the atomic settlement RPC', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          billed_credits: '125.5',
          closed: false,
          provider_cost_usd: '0.01255',
          remaining_reserved_credits: '1874.5',
          success: true,
        },
      ],
      error: null,
    });

    await expect(
      settleLiveBillingSession({
        close: false,
        liveSessionId: 'live-1',
        sequence: 3,
        usage,
        userId: 'user-1',
      })
    ).resolves.toEqual({
      billedCredits: 125.5,
      closed: false,
      providerCostUsd: 0.01255,
      remainingReservedCredits: 1874.5,
    });
    expect(rpc).toHaveBeenCalledWith('settle_ai_live_session', {
      p_close: false,
      p_live_session_id: 'live-1',
      p_sequence: 3,
      p_usage: usage,
      p_user_id: 'user-1',
    });
  });
});
