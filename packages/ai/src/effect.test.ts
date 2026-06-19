import { Effect, runEffectAsResult } from '@tuturuuu/utils/effect';
import { describe, expect, it, vi } from 'vitest';
import {
  AiCreditsService,
  checkAiCreditsEffect,
  deductAiCreditsEffect,
} from './effect';

describe('@tuturuuu/ai/effect', () => {
  it('uses the provided AI credits service for credit checks', async () => {
    const checkAiCredits = vi.fn().mockResolvedValue({
      allowed: true,
      remainingCredits: 100,
      tier: 'PRO',
      maxOutputTokens: 4096,
      errorCode: null,
      errorMessage: null,
    });
    const deductAiCredits = vi.fn();

    const result = await Effect.runPromise(
      checkAiCreditsEffect('ws-1', 'google/gemini-embedding-2', 'embeddings', {
        userId: 'user-1',
      }).pipe(
        Effect.provideService(AiCreditsService, {
          checkAiCredits,
          deductAiCredits,
        })
      )
    );

    expect(result.allowed).toBe(true);
    expect(checkAiCredits).toHaveBeenCalledWith(
      'ws-1',
      'google/gemini-embedding-2',
      'embeddings',
      { userId: 'user-1' }
    );
  });

  it('uses the provided AI credits service for deductions', async () => {
    const checkAiCredits = vi.fn();
    const deductAiCredits = vi.fn().mockResolvedValue({
      success: true,
      creditsDeducted: 2,
      remainingCredits: 98,
      errorCode: null,
    });

    const params = {
      feature: 'chat' as const,
      inputTokens: 10,
      modelId: 'google/gemini-2.5-flash',
      outputTokens: 20,
      wsId: 'ws-1',
    };

    const result = await Effect.runPromise(
      deductAiCreditsEffect(params).pipe(
        Effect.provideService(AiCreditsService, {
          checkAiCredits,
          deductAiCredits,
        })
      )
    );

    expect(result.success).toBe(true);
    expect(deductAiCredits).toHaveBeenCalledWith(params);
  });

  it('keeps service failures in the Effect result boundary', async () => {
    const result = await runEffectAsResult(
      checkAiCreditsEffect('ws-1', 'model-1', 'chat').pipe(
        Effect.provideService(AiCreditsService, {
          checkAiCredits: vi
            .fn()
            .mockRejectedValue(new Error('RPC unavailable')),
          deductAiCredits: vi.fn(),
        })
      )
    );

    expect(result).toEqual({
      ok: false,
      error: {
        _tag: 'TuturuuuEffectError',
        code: 'AI_CREDIT_CHECK_FAILED',
        message: 'RPC unavailable',
        context: {
          feature: 'chat',
          modelId: 'model-1',
          wsId: 'ws-1',
        },
        cause: {
          name: 'Error',
          message: 'RPC unavailable',
        },
      },
    });
  });
});
