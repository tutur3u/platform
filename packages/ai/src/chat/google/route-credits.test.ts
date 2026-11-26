import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cap: vi.fn(),
  check: vi.fn(),
  commitReservation: vi.fn(),
  deduct: vi.fn(),
  planPolicy: vi.fn(),
  prices: vi.fn(),
  recordUnbilled: vi.fn(),
  releaseReservation: vi.fn(),
  reserve: vi.fn(),
  settleReservation: vi.fn(),
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.check,
  deductAiCredits: mocks.deduct,
  recordUnbilledAiCharge: mocks.recordUnbilled,
}));
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@tuturuuu/ai/credits/cap-output-tokens')
    >();
  return {
    ...actual,
    capMaxOutputTokensByCredits: mocks.cap,
    readModelTokenPrices: mocks.prices,
    readPlanBudgetPolicy: mocks.planPolicy,
  };
});
vi.mock('@tuturuuu/ai/credits/reservations', () => ({
  commitFixedAiCreditReservation: mocks.commitReservation,
  releaseFixedAiCreditReservation: mocks.releaseReservation,
  reserveFixedAiCredits: mocks.reserve,
  settleMeteredAiCreditReservation: mocks.settleReservation,
}));

import {
  createChatReservationSettlement,
  hasExhaustedChatCreditBudget,
  performCreditPreflight,
  settleOrReleaseChatCreditReservation,
} from './route-credits';

const preflightArgs = {
  wsId: 'ws',
  model: 'model',
  userId: 'user',
  sbAdmin: {} as Parameters<typeof performCreditPreflight>[0]['sbAdmin'],
  reserveCredits: true,
};

describe('chat provider budget boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prices.mockResolvedValue({
      inputPricePerToken: 0.000001,
      outputPricePerToken: 0.00002,
      searchPrice: 0,
    });
    mocks.planPolicy.mockResolvedValue({
      markupMultiplier: 1.0,
      dailyLimit: null,
      maxRequestsPerDay: null,
    });
    mocks.reserve.mockResolvedValue({
      success: true,
      reservationId: 'res-1',
      remainingCredits: 900,
      errorCode: null,
    });
    mocks.settleReservation.mockResolvedValue({
      success: true,
      creditsDeducted: 5,
      remainingCredits: 995,
      errorCode: null,
    });
    mocks.commitReservation.mockResolvedValue({
      success: true,
      creditsDeducted: 10,
      remainingCredits: 0,
      errorCode: null,
    });
    mocks.releaseReservation.mockResolvedValue({
      success: true,
      remainingCredits: 1000,
      errorCode: null,
    });
    mocks.deduct.mockResolvedValue({
      success: true,
      creditsDeducted: 5,
      remainingCredits: 995,
      errorCode: null,
    });
  });

  it('rejects missing input pricing or unverifiable output cap even when credits remain', async () => {
    mocks.check.mockResolvedValue({
      allowed: true,
      remainingCredits: 1000,
      maxOutputTokens: null,
      tier: 'FREE',
    });
    mocks.prices.mockResolvedValueOnce({
      inputPricePerToken: null,
      outputPricePerToken: 0.00002,
    });
    const missingInputRes = await performCreditPreflight(preflightArgs);
    expect('error' in missingInputRes).toBe(true);
    if ('error' in missingInputRes)
      expect(missingInputRes.error.status).toBe(503);

    mocks.cap.mockResolvedValueOnce(null);
    const result = await performCreditPreflight(preflightArgs);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(503);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('loads price metadata alongside the allowance and sanitizes RPC denial messages', async () => {
    let releasePrice:
      | ((prices: {
          inputPricePerToken: number;
          outputPricePerToken: number;
        }) => void)
      | undefined;
    mocks.prices.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePrice = resolve;
        })
    );
    mocks.check.mockResolvedValue({
      allowed: false,
      remainingCredits: 0,
      errorMessage: 'Internal SQL detail: balance=0 for ws_id=123',
      errorCode: 'UNKNOWN_PRIVATE_CODE',
    });

    const pending = performCreditPreflight(preflightArgs);
    await vi.waitFor(() => {
      expect(mocks.check).toHaveBeenCalled();
      expect(releasePrice).toEqual(expect.any(Function));
    });
    expect(mocks.cap).not.toHaveBeenCalled();
    releasePrice?.({ inputPricePerToken: 0.01, outputPricePerToken: 0.5 });
    const result = await pending;

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(403);
      const body = await result.error.json();
      expect(body).toEqual({
        code: 'ACCESS_DENIED',
        error:
          'You do not have permission to use AI features in this workspace.',
      });
      expect(JSON.stringify(body)).not.toContain('Internal SQL detail');
    }
    expect(mocks.cap).not.toHaveBeenCalled();
  });

  it('keeps an allowance denial when the price read fails', async () => {
    mocks.prices.mockRejectedValue(new Error('price metadata unavailable'));
    mocks.check.mockResolvedValue({
      allowed: false,
      remainingCredits: 0,
      errorMessage: 'Private balance text',
      errorCode: 'INSUFFICIENT_CREDITS',
    });

    const result = await performCreditPreflight(preflightArgs);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(403);
      await expect(result.error.json()).resolves.toEqual({
        code: 'INSUFFICIENT_CREDITS',
        error: 'You have run out of AI credits.',
      });
    }
    expect(mocks.cap).not.toHaveBeenCalled();
  });

  it('accounts for input token cost and markup, reserves atomically, and derives final cap from the hold', async () => {
    mocks.planPolicy.mockResolvedValueOnce({
      markupMultiplier: 1.5,
      dailyLimit: null,
      maxRequestsPerDay: null,
    });
    mocks.check.mockResolvedValue({
      allowed: true,
      remainingCredits: 100,
      maxOutputTokens: 4096,
      tier: 'FREE',
    });
    mocks.cap.mockResolvedValue(200);

    const result = await performCreditPreflight({
      ...preflightArgs,
      estimatedInputTokens: 1000,
    });

    expect('error' in result).toBe(false);
    // 1000 * 0.000001 / 0.0001 * 1.5 = 15 credits deducted for input; output+reasoning uses /2
    expect(mocks.cap).toHaveBeenNthCalledWith(
      1,
      preflightArgs.sbAdmin,
      'model',
      4096,
      42.5,
      1.5,
      0.00002
    );
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId: 'ws',
        userId: 'user',
        modelId: 'model',
        feature: 'chat',
        expiresInSeconds: 300,
      }),
      preflightArgs.sbAdmin
    );
    expect(mocks.cap).toHaveBeenCalledTimes(2);
    if (!('error' in result)) {
      expect(result.reservationId).toBe('res-1');
      expect(result.tier).toBe('FREE');
      expect(result.markupMultiplier).toBe(1.5);
    }
  });

  it('rejects concurrent requests when atomic credit reservation fails', async () => {
    mocks.check.mockResolvedValue({
      allowed: true,
      remainingCredits: 10,
      maxOutputTokens: 512,
      tier: 'FREE',
    });
    mocks.cap.mockResolvedValue(50);
    mocks.reserve.mockResolvedValueOnce({
      success: false,
      reservationId: null,
      remainingCredits: 0,
      errorCode: 'INSUFFICIENT_CREDITS',
    });

    const result = await performCreditPreflight(preflightArgs);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(403);
      await expect(result.error.json()).resolves.toEqual({
        code: 'CREDITS_EXHAUSTED',
        error: 'You have run out of AI credits.',
      });
    }
  });

  it('stops multi-step tool loops when next step worst-case spend exceeds reserved budget or pricing is missing', () => {
    // Missing pricing with active reservation fails closed
    expect(
      hasExhaustedChatCreditBudget(
        [{ usage: { inputTokens: 10, outputTokens: 10 } }],
        {
          cappedMaxOutput: 100,
          reservedCredits: 10,
          inputPricePerToken: null,
          outputPricePerToken: 0.00002,
        }
      )
    ).toBe(true);

    // 100 output tokens at 0.00002 * 2 (output+reasoning) * 1.5 markup = 60 credits
    const budget = {
      cappedMaxOutput: 100,
      reservedCredits: 100,
      markupMultiplier: 1.5,
      inputPricePerToken: 0.000001,
      outputPricePerToken: 0.00002,
    };
    // Step 1 spent ~3 credits + worst-case next step ~60 credits <= 100 -> allow step 2
    expect(
      hasExhaustedChatCreditBudget(
        [{ usage: { inputTokens: 100, outputTokens: 10 } }],
        budget
      )
    ).toBe(false);
    // Step 1+2 spent ~45 credits + worst-case next step ~60 credits > 100 -> stop before step 3
    expect(
      hasExhaustedChatCreditBudget(
        [{ usage: { inputTokens: 100, outputTokens: 150 } }],
        budget
      )
    ).toBe(true);
    // Large tool results entering the next prompt also trigger the budget stop
    expect(
      hasExhaustedChatCreditBudget(
        [
          {
            toolResults: [{ payload: 'x'.repeat(12_000) }],
            usage: { inputTokens: 100, outputTokens: 10 },
          },
        ],
        budget
      )
    ).toBe(true);
  });

  it('commits active hold without double-queueing retry on settlement failure, and deducts directly on expired hold', async () => {
    mocks.settleReservation.mockResolvedValueOnce({
      success: false,
      creditsDeducted: 0,
      remainingCredits: 10,
      errorCode: 'SETTLEMENT_FAILED',
    });

    await settleOrReleaseChatCreditReservation({
      sbAdmin: preflightArgs.sbAdmin,
      reservationId: 'res-1',
      wsId: 'ws',
      userId: 'user',
      modelId: 'model',
      chatMessageId: 'msg-1',
      inputTokens: 100,
      outputTokens: 500,
      reasoningTokens: 0,
      searchCount: 0,
    });

    expect(mocks.commitReservation).toHaveBeenCalledOnce();
    expect(mocks.recordUnbilled).not.toHaveBeenCalled();

    mocks.settleReservation.mockResolvedValueOnce({
      success: false,
      creditsDeducted: 0,
      remainingCredits: 10,
      errorCode: 'RESERVATION_EXPIRED',
    });

    await settleOrReleaseChatCreditReservation({
      sbAdmin: preflightArgs.sbAdmin,
      reservationId: 'res-expired',
      wsId: 'ws',
      userId: 'user',
      modelId: 'model',
      chatMessageId: 'msg-2',
      inputTokens: 100,
      outputTokens: 200,
      reasoningTokens: 0,
      searchCount: 0,
    });

    expect(mocks.deduct).toHaveBeenCalledWith(
      expect.objectContaining({
        chatMessageId: 'msg-2',
        inputTokens: 100,
        outputTokens: 200,
      })
    );
  });

  it('falls back to PAYG-backed metered deduction on paid tiers without relaxing FREE holds', async () => {
    const sbAdminWithPayg = {
      rpc: vi.fn(async (fn: string) =>
        fn === '_get_active_payg_credits'
          ? { data: 2000, error: null }
          : { data: null, error: null }
      ),
    } as unknown as Parameters<typeof performCreditPreflight>[0]['sbAdmin'];

    mocks.check.mockResolvedValueOnce({
      allowed: true,
      remainingCredits: 2000,
      maxOutputTokens: 4096,
      tier: 'PRO',
    });
    mocks.cap.mockResolvedValue(512);
    mocks.reserve.mockResolvedValueOnce({
      success: false,
      reservationId: null,
      remainingCredits: 0,
      errorCode: 'INSUFFICIENT_CREDITS',
    });

    const paidResult = await performCreditPreflight({
      ...preflightArgs,
      sbAdmin: sbAdminWithPayg,
    });
    expect('error' in paidResult).toBe(false);
    if (!('error' in paidResult)) {
      expect(paidResult.reservationId).toBeUndefined();
      expect(paidResult.reservedCredits).toBeGreaterThan(0);
      expect(paidResult.cappedMaxOutput).toBe(512);
    }

    mocks.check.mockResolvedValueOnce({
      allowed: true,
      remainingCredits: 2000,
      maxOutputTokens: 4096,
      tier: 'FREE',
    });
    mocks.reserve.mockResolvedValueOnce({
      success: false,
      reservationId: null,
      remainingCredits: 0,
      errorCode: 'INSUFFICIENT_CREDITS',
    });
    const freeResult = await performCreditPreflight({
      ...preflightArgs,
      sbAdmin: sbAdminWithPayg,
    });
    expect('error' in freeResult).toBe(true);
    if ('error' in freeResult) {
      expect(freeResult.error.status).toBe(403);
    }
  });

  it('does not enqueue duplicate message-keyed retry when fixed commit transport fails ambiguously', async () => {
    mocks.settleReservation.mockResolvedValueOnce({
      success: false,
      creditsDeducted: 0,
      remainingCredits: 10,
      errorCode: 'SETTLEMENT_FAILED',
    });
    mocks.commitReservation.mockResolvedValueOnce({
      success: false,
      creditsDeducted: 0,
      remainingCredits: 0,
      errorCode: 'COMMIT_FAILED',
    });

    await settleOrReleaseChatCreditReservation({
      sbAdmin: preflightArgs.sbAdmin,
      reservationId: 'res-ambiguous',
      wsId: 'ws',
      userId: 'user',
      modelId: 'model',
      chatMessageId: 'msg-ambiguous',
      inputTokens: 100,
      outputTokens: 200,
      reasoningTokens: 0,
      searchCount: 0,
    });

    expect(mocks.commitReservation).toHaveBeenCalledOnce();
    expect(mocks.recordUnbilled).not.toHaveBeenCalled();
  });

  it('disables native Google Search when Rewise balance cannot afford search pricing and enables it when affordable', async () => {
    mocks.prices.mockResolvedValue({
      inputPricePerToken: 0.000001,
      outputPricePerToken: 0.00002,
      searchPrice: 0.04,
    });
    mocks.cap.mockResolvedValue(200);

    // 100 credits covers tokens but not 4 * $0.04 (1600 credits) -> disable native search
    mocks.check.mockResolvedValueOnce({
      allowed: true,
      remainingCredits: 100,
      maxOutputTokens: 4096,
      tier: 'FREE',
    });
    const tokenOnly = await performCreditPreflight({
      ...preflightArgs,
      model: 'google/gemini-3.1-flash-lite',
      enableNativeSearch: true,
    });
    expect('error' in tokenOnly).toBe(false);
    if (!('error' in tokenOnly)) {
      expect(tokenOnly.allowNativeSearch).toBe(false);
    }

    // 5000 credits covers tokens + 1600 search credits -> enable and reserve for search
    mocks.check.mockResolvedValueOnce({
      allowed: true,
      remainingCredits: 5000,
      maxOutputTokens: 4096,
      tier: 'PRO',
    });
    const withSearch = await performCreditPreflight({
      ...preflightArgs,
      model: 'google/gemini-3.1-flash-lite',
      enableNativeSearch: true,
    });
    expect('error' in withSearch).toBe(false);
    if (!('error' in withSearch)) {
      expect(withSearch.allowNativeSearch).toBe(true);
      expect(withSearch.reservedCredits).toBeGreaterThanOrEqual(1600);
    }
  });

  it('settles reported PAYG usage with a stable charge key even without a saved assistant message', async () => {
    const settlement = createChatReservationSettlement({
      budget: {
        reservedCredits: 250,
      },
      sbAdmin: preflightArgs.sbAdmin,
      wsId: 'ws-pro',
      userId: 'user-1',
      modelId: 'google/gemini-3.1-flash-lite',
      chargeKey: 'req-payg-1',
    });

    expect(settlement.settle).toBeDefined();
    await settlement.settle?.({
      inputTokens: 120,
      outputTokens: 80,
      reasoningTokens: 0,
      searchCount: 1,
    });
    // Second call is idempotently ignored
    await settlement.settle?.({
      inputTokens: 120,
      outputTokens: 80,
      reasoningTokens: 0,
      searchCount: 1,
    });

    expect(mocks.deduct).toHaveBeenCalledTimes(1);
    expect(mocks.deduct).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId: 'ws-pro',
        userId: 'user-1',
        inputTokens: 120,
        outputTokens: 80,
        searchCount: 1,
        metadata: expect.objectContaining({
          source: 'chat_payg_settlement',
          chargeKey: 'req-payg-1',
        }),
      })
    );
  });

  it('omits estimatedInputTokens from checkAiCredits and queues recordUnbilledAiCharge when PAYG deduction throws', async () => {
    mocks.check.mockResolvedValueOnce({
      allowed: true,
      remainingCredits: 100,
      maxOutputTokens: 4096,
      tier: 'FREE',
    });
    mocks.cap.mockResolvedValue(200);
    await performCreditPreflight({
      ...preflightArgs,
      estimatedInputTokens: 500,
      enableNativeSearch: true,
    });
    expect(mocks.check).toHaveBeenCalledWith('ws', 'model', 'chat', {
      userId: 'user',
    });

    mocks.deduct.mockRejectedValueOnce(new Error('transient network error'));
    const settlement = createChatReservationSettlement({
      budget: {
        reservedCredits: 250,
      },
      sbAdmin: preflightArgs.sbAdmin,
      wsId: 'ws-pro',
      userId: 'user-1',
      modelId: 'google/gemini-3.1-flash-lite',
      chargeKey: 'req-payg-throw',
    });

    await settlement.settle?.({
      chatMessageId: 'msg-payg-1',
      inputTokens: 120,
      outputTokens: 80,
      reasoningTokens: 0,
      searchCount: 0,
    });

    expect(mocks.recordUnbilled).toHaveBeenCalledWith(
      expect.objectContaining({
        chatMessageId: 'msg-payg-1',
        wsId: 'ws-pro',
        userId: 'user-1',
        errorCode: 'DEDUCTION_THROWN',
      })
    );
  });

  it('rejects paid PAYG balances below the 1-credit minimum charge', async () => {
    const sbAdminLowPayg = {
      rpc: vi.fn(async (fn: string) =>
        fn === '_get_active_payg_credits'
          ? { data: 0.5, error: null }
          : { data: null, error: null }
      ),
    } as unknown as Parameters<typeof performCreditPreflight>[0]['sbAdmin'];

    mocks.check.mockResolvedValueOnce({
      allowed: true,
      remainingCredits: 10,
      maxOutputTokens: 4096,
      tier: 'PRO',
    });
    mocks.cap.mockResolvedValue(200);
    mocks.reserve.mockResolvedValueOnce({
      success: false,
      reservationId: null,
      remainingCredits: 0,
      errorCode: 'INSUFFICIENT_CREDITS',
    });

    const result = await performCreditPreflight({
      ...preflightArgs,
      sbAdmin: sbAdminLowPayg,
    });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(403);
      await expect(result.error.json()).resolves.toEqual({
        code: 'CREDITS_EXHAUSTED',
        error: 'You have run out of AI credits.',
      });
    }
  });
});
