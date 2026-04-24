import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  decrementAiCreditChargeInFlight: vi.fn(),
  hasAiCreditChargeInFlight: vi.fn(),
  incrementAiCreditChargeInFlight: vi.fn(),
  invalidateAiCreditSnapshot: vi.fn(),
  isAiCreditSnapshotUsable: vi.fn(),
  readAiCreditSnapshot: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  decrementAiCreditChargeInFlight: (
    ...args: Parameters<typeof mocks.decrementAiCreditChargeInFlight>
  ) => mocks.decrementAiCreditChargeInFlight(...args),
  hasAiCreditChargeInFlight: (
    ...args: Parameters<typeof mocks.hasAiCreditChargeInFlight>
  ) => mocks.hasAiCreditChargeInFlight(...args),
  incrementAiCreditChargeInFlight: (
    ...args: Parameters<typeof mocks.incrementAiCreditChargeInFlight>
  ) => mocks.incrementAiCreditChargeInFlight(...args),
  invalidateAiCreditSnapshot: (
    ...args: Parameters<typeof mocks.invalidateAiCreditSnapshot>
  ) => mocks.invalidateAiCreditSnapshot(...args),
  isAiCreditSnapshotUsable: (
    ...args: Parameters<typeof mocks.isAiCreditSnapshotUsable>
  ) => mocks.isAiCreditSnapshotUsable(...args),
  readAiCreditSnapshot: (
    ...args: Parameters<typeof mocks.readAiCreditSnapshot>
  ) => mocks.readAiCreditSnapshot(...args),
}));

import { checkAiCredits, deductAiCredits } from './check-credits';
import { commitFixedAiCreditReservation } from './reservations';

describe('AI credit Redis snapshot cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.isAiCreditSnapshotUsable.mockReturnValue(false);
    mocks.hasAiCreditChargeInFlight.mockResolvedValue(false);
    mocks.incrementAiCreditChargeInFlight.mockResolvedValue(true);
    mocks.decrementAiCreditChargeInFlight.mockResolvedValue(true);
    mocks.readAiCreditSnapshot.mockResolvedValue(null);
    mocks.invalidateAiCreditSnapshot.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({
      data: [
        {
          allowed: true,
          remaining_credits: 1000,
          tier: 'PRO',
          max_output_tokens: 4096,
          error_code: null,
          error_message: null,
        },
      ],
      error: null,
    });
  });

  it('returns a usable snapshot without creating an admin client', async () => {
    mocks.readAiCreditSnapshot.mockResolvedValue({
      remainingCredits: 250,
      maxOutputTokens: 2048,
      tier: 'PRO',
      allowedModels: ['gemini-lite'],
      allowedFeatures: ['chat'],
      dailyLimit: null,
      updatedAt: Date.now(),
    });
    mocks.isAiCreditSnapshotUsable.mockReturnValue(true);

    const result = await checkAiCredits('workspace-1', 'gemini-lite', 'chat', {
      userId: 'user-1',
    });

    expect(result).toEqual({
      allowed: true,
      remainingCredits: 250,
      tier: 'PRO',
      maxOutputTokens: 2048,
      errorCode: null,
      errorMessage: null,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.hasAiCreditChargeInFlight).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
    });
    expect(mocks.isAiCreditSnapshotUsable).toHaveBeenCalledWith(
      expect.any(Object),
      { inFlight: false }
    );
  });

  it('falls back to the authoritative DB check when a charge is in flight', async () => {
    mocks.readAiCreditSnapshot.mockResolvedValue({
      remainingCredits: 250,
      maxOutputTokens: 2048,
      tier: 'PRO',
      allowedModels: [],
      allowedFeatures: [],
      dailyLimit: null,
      updatedAt: Date.now(),
    });
    mocks.hasAiCreditChargeInFlight.mockResolvedValue(true);
    mocks.isAiCreditSnapshotUsable.mockReturnValue(false);

    await checkAiCredits('workspace-1', 'gemini-lite', 'chat', {
      userId: 'user-1',
    });

    expect(mocks.isAiCreditSnapshotUsable).toHaveBeenCalledWith(
      expect.any(Object),
      { inFlight: true }
    );
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
  });

  it('falls back to the authoritative DB check when the snapshot is stale', async () => {
    mocks.readAiCreditSnapshot.mockResolvedValue({
      remainingCredits: 250,
      maxOutputTokens: 2048,
      tier: 'PRO',
      allowedModels: ['*'],
      allowedFeatures: ['chat'],
      dailyLimit: null,
      updatedAt: Date.now() - 60_000,
    });
    mocks.isAiCreditSnapshotUsable.mockReturnValue(false);

    const result = await checkAiCredits('workspace-1', 'gemini-lite', 'chat', {
      userId: 'user-1',
    });

    expect(result.remainingCredits).toBe(1000);
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'check_ai_credit_allowance',
      expect.objectContaining({
        p_ws_id: 'workspace-1',
        p_user_id: 'user-1',
      })
    );
  });

  it('falls back when the cached model or feature allowance does not match', async () => {
    mocks.readAiCreditSnapshot.mockResolvedValue({
      remainingCredits: 250,
      maxOutputTokens: 2048,
      tier: 'PRO',
      allowedModels: ['different-model'],
      allowedFeatures: ['summaries'],
      dailyLimit: null,
      updatedAt: Date.now(),
    });
    mocks.isAiCreditSnapshotUsable.mockReturnValue(true);

    await checkAiCredits('workspace-1', 'gemini-lite', 'chat', {
      userId: 'user-1',
    });

    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'check_ai_credit_allowance',
      expect.any(Object)
    );
  });

  it('invalidates the snapshot after a successful token deduction', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          success: true,
          credits_deducted: 12,
          remaining_credits: 988,
          error_code: null,
        },
      ],
      error: null,
    });

    const result = await deductAiCredits({
      wsId: 'workspace-1',
      userId: 'user-1',
      modelId: 'gemini-lite',
      inputTokens: 100,
      outputTokens: 20,
      feature: 'chat',
    });

    expect(result.success).toBe(true);
    expect(mocks.incrementAiCreditChargeInFlight).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
    });
    expect(mocks.decrementAiCreditChargeInFlight).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
    });
    expect(mocks.invalidateAiCreditSnapshot).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
    });
  });

  it('invalidates the snapshot after a fixed-cost reservation commit', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          success: true,
          credits_deducted: 1,
          remaining_credits: 999,
          error_code: null,
        },
      ],
      error: null,
    });

    const result = await commitFixedAiCreditReservation('reservation-1', {
      wsId: 'workspace-1',
      userId: 'user-1',
      tool: 'image',
    });

    expect(result.success).toBe(true);
    expect(mocks.incrementAiCreditChargeInFlight).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
    });
    expect(mocks.decrementAiCreditChargeInFlight).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
    });
    expect(mocks.invalidateAiCreditSnapshot).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
    });
  });
});
