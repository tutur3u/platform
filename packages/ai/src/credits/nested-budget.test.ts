import type { SupabaseClient } from '@tuturuuu/supabase';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkAiCredits: vi.fn(),
  commitFixedAiCreditReservation: vi.fn(),
  deductAiCredits: vi.fn(),
  readModelTokenPrices: vi.fn(),
  readPlanBudgetPolicy: vi.fn(),
  recordUnbilledAiCharge: vi.fn(),
  releaseFixedAiCreditReservation: vi.fn(),
  reserveFixedAiCredits: vi.fn(),
  settleMeteredAiCreditReservation: vi.fn(),
}));

vi.mock('./cap-output-tokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cap-output-tokens')>();
  return {
    ...actual,
    readModelTokenPrices: mocks.readModelTokenPrices,
    readPlanBudgetPolicy: mocks.readPlanBudgetPolicy,
  };
});

vi.mock('./check-credits', () => ({
  checkAiCredits: mocks.checkAiCredits,
  deductAiCredits: mocks.deductAiCredits,
  recordUnbilledAiCharge: mocks.recordUnbilledAiCharge,
}));

vi.mock('./reservations', () => ({
  commitFixedAiCreditReservation: mocks.commitFixedAiCreditReservation,
  releaseFixedAiCreditReservation: mocks.releaseFixedAiCreditReservation,
  reserveFixedAiCredits: mocks.reserveFixedAiCredits,
  settleMeteredAiCreditReservation: mocks.settleMeteredAiCreditReservation,
}));

import { reserveNestedModelBudget } from './nested-budget';

function createMockAdmin({
  paygCredits = 0,
  dailySettled = 0,
  dailyHeld = 0,
  dailyRequests = 0,
  dailyTxPages,
  activeHoldsAfterReserve,
}: {
  paygCredits?: number;
  dailySettled?: number;
  dailyHeld?: number;
  dailyRequests?: number;
  dailyTxPages?: Array<Array<{ amount: number }>>;
  activeHoldsAfterReserve?: number[];
} = {}) {
  let holdQueryCount = 0;
  const totalTxCount = dailyTxPages
    ? dailyTxPages.reduce((sum, page) => sum + page.length, 0)
    : dailySettled > 0 || dailyRequests > 0
      ? Math.max(1, dailyRequests)
      : 0;
  return {
    rpc: vi.fn(async (fn: string) => {
      if (fn === '_get_active_payg_credits') {
        return { data: paygCredits, error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table === 'workspace_ai_credit_balances') {
        const chain = {
          select: vi.fn(() => chain),
          gt: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          is: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: { id: 'balance-1' },
            error: null,
          })),
        };
        return chain;
      }
      if (table === 'ai_credit_transactions') {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          range: vi.fn(async (from: number) => {
            if (dailyTxPages) {
              const pageIndex = Math.floor(from / 1000);
              return {
                data: dailyTxPages[pageIndex] ?? [],
                count: totalTxCount,
                error: null,
              };
            }
            return {
              data:
                from === 0 && (dailySettled > 0 || dailyRequests > 0)
                  ? Array.from(
                      { length: Math.max(1, dailyRequests) },
                      (_, i) => ({
                        amount: i === 0 ? -dailySettled : 0,
                      })
                    )
                  : [],
              count: totalTxCount,
              error: null,
            };
          }),
        };
        return chain;
      }
      throw new Error(`Unexpected public table ${table}`);
    }),
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn((columns: string) => {
          if (columns === 'balance_id') {
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { balance_id: 'balance-1' },
                  error: null,
                })),
              })),
            };
          }
          const chain = {
            eq: vi.fn(() => chain),
            gt: vi.fn(() => chain),
            order: vi.fn(() => chain),
            range: vi.fn(async () => {
              holdQueryCount += 1;
              if (holdQueryCount === 1) {
                const rows = dailyHeld > 0 ? [{ amount: dailyHeld }] : [];
                return { data: rows, count: rows.length, error: null };
              }
              const amounts = activeHoldsAfterReserve ?? [dailyHeld];
              const rows = amounts
                .filter((amount) => amount > 0)
                .map((amount) => ({ amount }));
              return { data: rows, count: rows.length, error: null };
            }),
          };
          return chain;
        }),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe('reserveNestedModelBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      remainingCredits: 5000,
      maxOutputTokens: 4096,
      tier: 'PRO',
      errorCode: null,
      errorMessage: null,
    });
    mocks.readModelTokenPrices.mockResolvedValue({
      inputPricePerToken: 0.000001,
      outputPricePerToken: 0.000004,
      searchPrice: 0.04,
    });
    mocks.readPlanBudgetPolicy.mockResolvedValue({
      markupMultiplier: 1.0,
      dailyLimit: null,
      maxRequestsPerDay: null,
    });
    mocks.reserveFixedAiCredits.mockResolvedValue({
      success: true,
      reservationId: 'nested-res-1',
      remainingCredits: 3000,
      errorCode: null,
    });
    mocks.releaseFixedAiCreditReservation.mockResolvedValue({
      success: true,
      remainingCredits: 5000,
      errorCode: null,
    });
    mocks.settleMeteredAiCreditReservation.mockResolvedValue({
      success: true,
      creditsDeducted: 10,
      remainingCredits: 4990,
      errorCode: null,
    });
    mocks.commitFixedAiCreditReservation.mockResolvedValue({
      success: false,
      creditsDeducted: 0,
      remainingCredits: 0,
      errorCode: 'COMMIT_FAILED',
    });
    mocks.deductAiCredits.mockResolvedValue({
      success: true,
      creditsDeducted: 10,
      remainingCredits: 4990,
      errorCode: null,
    });
  });

  it('adds real search_price cost to the token reserve ceiling and denies when balance cannot cover search', async () => {
    const sbAdmin = createMockAdmin();
    // 4 queries * $0.04 / $0.0001 = 1600 search credits + 20 token reserve = 1620 hold
    const admitted = await reserveNestedModelBudget({
      sbAdmin,
      wsId: 'ws-1',
      userId: 'user-1',
      modelId: 'google/gemini-3.5-flash-lite',
      estimatedInputTokens: 100,
      attemptCount: 2,
      estimatedSearchCount: 4,
      maxReserveCredits: 20,
      maxOutputTokensLimit: 2048,
    });

    expect(admitted.ok).toBe(true);
    if (admitted.ok) {
      expect(admitted.heldCredits).toBe(1620);
      expect(admitted.perAttemptMaxOutputTokens).toBeGreaterThan(0);
    }
    expect(mocks.reserveFixedAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1620 }),
      sbAdmin
    );

    // Balance below 1600 search credits is denied before reserving
    mocks.checkAiCredits.mockResolvedValueOnce({
      allowed: true,
      remainingCredits: 500,
      maxOutputTokens: 4096,
      tier: 'FREE',
      errorCode: null,
      errorMessage: null,
    });
    const denied = await reserveNestedModelBudget({
      sbAdmin,
      wsId: 'ws-1',
      userId: 'user-1',
      modelId: 'google/gemini-3.5-flash-lite',
      estimatedInputTokens: 100,
      attemptCount: 2,
      estimatedSearchCount: 4,
      maxReserveCredits: 20,
      maxOutputTokensLimit: 2048,
    });
    expect(denied).toEqual({
      ok: false,
      code: 'CREDITS_EXHAUSTED',
      status: 403,
    });
  });

  it('enforces daily capacity with active holds and releases the hold on post-reserve race', async () => {
    mocks.readPlanBudgetPolicy.mockResolvedValueOnce({
      markupMultiplier: 1.0,
      dailyLimit: 50,
      maxRequestsPerDay: null,
    });
    const sbAdmin = createMockAdmin({
      dailySettled: 30,
      dailyHeld: 0,
      // Simulate concurrent hold landing before post-reserve check: 30 + 20 + 15 > 50
      activeHoldsAfterReserve: [20, 15],
    });

    const result = await reserveNestedModelBudget({
      sbAdmin,
      wsId: 'ws-1',
      userId: 'user-1',
      modelId: 'google/gemini-3.1-flash-lite',
      estimatedInputTokens: 100,
      maxReserveCredits: 30,
    });

    expect(result).toEqual({
      ok: false,
      code: 'DAILY_LIMIT_REACHED',
      status: 403,
    });
    expect(mocks.reserveFixedAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 20 }),
      sbAdmin
    );
    expect(mocks.releaseFixedAiCreditReservation).toHaveBeenCalledWith(
      'nested-res-1',
      expect.objectContaining({ releaseReason: 'DAILY_LIMIT_REACHED' }),
      sbAdmin
    );
  });

  it('allows paid workspaces with active PAYG credits when fixed hold sees zero included credits', async () => {
    mocks.reserveFixedAiCredits.mockResolvedValueOnce({
      success: false,
      reservationId: null,
      remainingCredits: 0,
      errorCode: 'INSUFFICIENT_CREDITS',
    });
    const sbAdmin = createMockAdmin({ paygCredits: 2500 });

    const result = await reserveNestedModelBudget({
      sbAdmin,
      wsId: 'ws-pro',
      userId: 'user-1',
      modelId: 'google/gemini-3.1-flash-lite',
      estimatedInputTokens: 100,
      maxReserveCredits: 15,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reservationId).toBeNull();
      await result.settle({
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 0,
      });
    }
    expect(mocks.deductAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId: 'ws-pro',
        inputTokens: 100,
        outputTokens: 50,
      })
    );
  });

  it('does not enqueue duplicate unbilled retries on ambiguous COMMIT_FAILED transport errors', async () => {
    const sbAdmin = createMockAdmin();
    mocks.settleMeteredAiCreditReservation.mockResolvedValueOnce({
      success: false,
      creditsDeducted: 0,
      remainingCredits: 100,
      errorCode: 'SETTLEMENT_FAILED',
    });

    const budget = await reserveNestedModelBudget({
      sbAdmin,
      wsId: 'ws-1',
      userId: 'user-1',
      modelId: 'google/gemini-3.1-flash-lite',
      estimatedInputTokens: 100,
      maxReserveCredits: 15,
    });
    expect(budget.ok).toBe(true);
    if (budget.ok) {
      await budget.settle({
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 0,
      });
    }

    expect(mocks.commitFixedAiCreditReservation).toHaveBeenCalledOnce();
    expect(mocks.recordUnbilledAiCharge).not.toHaveBeenCalled();
    expect(mocks.deductAiCredits).not.toHaveBeenCalled();
  });

  it('paginates daily usage past PostgREST 1,000-row caps so high-volume balances are never undercounted', async () => {
    mocks.readPlanBudgetPolicy.mockResolvedValueOnce({
      markupMultiplier: 1.0,
      dailyLimit: 1050,
      maxRequestsPerDay: null,
    });
    const page1 = Array.from({ length: 1000 }, () => ({ amount: -1 }));
    const page2 = Array.from({ length: 60 }, () => ({ amount: -1 }));
    const sbAdmin = createMockAdmin({
      dailyTxPages: [page1, page2],
    });

    const denied = await reserveNestedModelBudget({
      sbAdmin,
      wsId: 'ws-1',
      userId: 'user-1',
      modelId: 'google/gemini-3.1-flash-lite',
      estimatedInputTokens: 100,
      maxReserveCredits: 15,
    });

    expect(denied).toEqual({
      ok: false,
      code: 'DAILY_LIMIT_REACHED',
      status: 403,
    });
    expect(mocks.reserveFixedAiCredits).not.toHaveBeenCalled();
  });

  it('rejects paid PAYG balances below the 1-credit minimum charge', async () => {
    mocks.reserveFixedAiCredits.mockResolvedValueOnce({
      success: false,
      reservationId: null,
      remainingCredits: 0,
      errorCode: 'INSUFFICIENT_CREDITS',
    });
    const sbAdmin = createMockAdmin({ paygCredits: 0.5 });

    const denied = await reserveNestedModelBudget({
      sbAdmin,
      wsId: 'ws-pro',
      userId: 'user-1',
      modelId: 'google/gemini-3.1-flash-lite',
      estimatedInputTokens: 100,
      maxReserveCredits: 15,
    });

    expect(denied).toEqual({
      ok: false,
      code: 'CREDITS_EXHAUSTED',
      status: 403,
    });
  });
});
