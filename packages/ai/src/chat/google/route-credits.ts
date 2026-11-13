import {
  capMaxOutputTokensByCredits,
  readOutputPricePerToken,
} from '@tuturuuu/ai/credits/cap-output-tokens';
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
  // The allowance RPC remains the admission gate. Price metadata is only an
  // output ceiling and is never used when the allowance denies the request.
  const allowancePromise = checkAiCredits(wsId ?? undefined, model, 'chat', {
    userId,
  });
  const pricePromise = readOutputPricePerToken(sbAdmin, model).then(
    (price) => ({ price, error: null as unknown }),
    (error: unknown) => ({ price: null, error })
  );
  const [creditCheck, priceResult] = await Promise.all([
    allowancePromise,
    pricePromise,
  ]);

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

  if (priceResult.error) throw priceResult.error;

  const cappedMaxOutput = creditCheck
    ? await capMaxOutputTokensByCredits(
        sbAdmin,
        model,
        creditCheck.maxOutputTokens,
        creditCheck.remainingCredits,
        1,
        priceResult.price
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
