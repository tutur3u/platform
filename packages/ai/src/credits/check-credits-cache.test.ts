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
import {
  commitFixedAiCreditReservation,
  reserveFixedAiCredits,
} from './reservations';

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

  it('does not authorize AI requests from Redis status snapshots', async () => {
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
      remainingCredits: 1000,
      tier: 'PRO',
      maxOutputTokens: 4096,
      errorCode: null,
      errorMessage: null,
    });
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'check_ai_credit_allowance',
      expect.objectContaining({
        p_ws_id: 'workspace-1',
        p_user_id: 'user-1',
      })
    );
    expect(mocks.readAiCreditSnapshot).not.toHaveBeenCalled();
    expect(mocks.hasAiCreditChargeInFlight).not.toHaveBeenCalled();
    expect(mocks.isAiCreditSnapshotUsable).not.toHaveBeenCalled();
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

  it('returns a structured reservation failure when the reserve RPC rejects', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mocks.rpc.mockRejectedValue(new Error('RPC unavailable'));

    const result = await reserveFixedAiCredits({
      wsId: 'workspace-1',
      userId: 'user-1',
      amount: 2,
      modelId: 'gemini-lite',
      feature: 'image_generation',
    });

    expect(result).toEqual({
      success: false,
      reservationId: null,
      remainingCredits: 0,
      errorCode: 'RESERVATION_FAILED',
    });
    expect(mocks.decrementAiCreditChargeInFlight).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
    });

    consoleErrorSpy.mockRestore();
  });

  it('returns a structured commit failure when the commit RPC rejects', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mocks.rpc.mockRejectedValue(new Error('RPC unavailable'));

    const result = await commitFixedAiCreditReservation('reservation-1', {
      wsId: 'workspace-1',
      userId: 'user-1',
      tool: 'image',
    });

    expect(result).toEqual({
      success: false,
      creditsDeducted: 0,
      remainingCredits: 0,
      errorCode: 'COMMIT_FAILED',
    });
    expect(mocks.decrementAiCreditChargeInFlight).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
    });

    consoleErrorSpy.mockRestore();
  });
});
