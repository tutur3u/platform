import type {
  CreditCheckResult,
  CreditDeductionResult,
  DeductCreditsParams,
} from '@tuturuuu/ai/credits/types';
import {
  Context,
  Effect,
  fromPromise,
  Layer,
  type TuturuuuEffectError,
} from '@tuturuuu/utils/effect';
import { checkAiCredits, deductAiCredits } from './credits/check-credits';
import type { AiFeature } from './credits/constants';

export interface AiCreditsServiceShape {
  readonly checkAiCredits: typeof checkAiCredits;
  readonly deductAiCredits: typeof deductAiCredits;
}

export class AiCreditsService extends Context.Tag(
  '@tuturuuu/ai/AiCreditsService'
)<AiCreditsService, AiCreditsServiceShape>() {}

export const AiCreditsLive = Layer.succeed(AiCreditsService, {
  checkAiCredits,
  deductAiCredits,
});

export function checkAiCreditsEffect(
  wsId: string | undefined,
  modelId: string,
  feature: AiFeature,
  opts?: { userId?: string; estimatedInputTokens?: number }
): Effect.Effect<CreditCheckResult, TuturuuuEffectError, AiCreditsService> {
  return Effect.gen(function* () {
    const service = yield* AiCreditsService;

    return yield* fromPromise(
      () => service.checkAiCredits(wsId, modelId, feature, opts),
      {
        code: 'AI_CREDIT_CHECK_FAILED',
        message: 'AI credit check failed.',
        context: { feature, modelId, wsId },
      }
    );
  });
}

export function deductAiCreditsEffect(
  params: DeductCreditsParams
): Effect.Effect<CreditDeductionResult, TuturuuuEffectError, AiCreditsService> {
  return Effect.gen(function* () {
    const service = yield* AiCreditsService;

    return yield* fromPromise(() => service.deductAiCredits(params), {
      code: 'AI_CREDIT_DEDUCTION_FAILED',
      message: 'AI credit deduction failed.',
      context: {
        feature: params.feature,
        modelId: params.modelId,
        wsId: params.wsId,
      },
    });
  });
}
