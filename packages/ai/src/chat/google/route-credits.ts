import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import { checkAiCredits } from '@tuturuuu/ai/credits/check-credits';
import type { SupabaseClient } from '@tuturuuu/supabase';

type AdminRpcClientLike = SupabaseClient;

type CreditPreflightParams = {
  wsId?: string;
  model: string;
  userId: string;
  sbAdmin: AdminRpcClientLike;
};

export async function performCreditPreflight({
  wsId,
  model,
  userId,
  sbAdmin,
}: CreditPreflightParams): Promise<
  { cappedMaxOutput: number | null } | { error: Response }
> {
  const creditCheck = await checkAiCredits(wsId ?? undefined, model, 'chat', {
    userId,
  });

  if (creditCheck && !creditCheck.allowed) {
    return {
      error: Response.json(
        {
          error: creditCheck.errorMessage || 'AI credits insufficient',
          code: creditCheck.errorCode,
        },
        { status: 403 }
      ),
    };
  }

  const cappedMaxOutput = creditCheck
    ? await capMaxOutputTokensByCredits(
        sbAdmin,
        model,
        creditCheck.maxOutputTokens,
        creditCheck.remainingCredits
      )
    : null;

  if (cappedMaxOutput === null) {
    return {
      error: Response.json(
        {
          error: 'AI request budget could not be verified',
          code: 'CREDIT_CHECK_FAILED',
        },
        { status: 503 }
      ),
    };
  }

  return { cappedMaxOutput };
}
