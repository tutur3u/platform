import { checkAiCredits } from '@tuturuuu/ai/credits/check-credits';
import {
  commitFixedAiCreditReservation,
  releaseFixedAiCreditReservation,
  reserveFixedAiCredits,
} from '@tuturuuu/ai/credits/reservations';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NormalizedSepayPayload } from './schemas';

type SepayAdminClient = TypedSupabaseClient;

const SEPAY_AI_FEATURE = 'generate' as const;
const SEPAY_AI_FIXED_COST_CREDITS = 1;
const SEPAY_AI_RESERVATION_TTL_SECONDS = 120;

export async function runSepayAiEnrichment<T>(input: {
  execute: (abortSignal: AbortSignal) => Promise<T>;
  kind: 'classifier' | 'tagger';
  modelId: string;
  payload: NormalizedSepayPayload;
  sbAdmin: SepayAdminClient;
  timeoutMs: number;
  wsId: string;
}): Promise<T | null> {
  try {
    const allowance = await checkAiCredits(
      input.wsId,
      input.modelId,
      SEPAY_AI_FEATURE
    );

    if (!allowance.allowed) {
      return null;
    }

    const reservationMetadata = {
      eventId: input.payload.eventId,
      kind: input.kind,
      referenceCode: input.payload.referenceCode,
      source: 'sepay_webhook',
      transferType: input.payload.transferType,
    };

    const reservation = await reserveFixedAiCredits(
      {
        amount: SEPAY_AI_FIXED_COST_CREDITS,
        expiresInSeconds: SEPAY_AI_RESERVATION_TTL_SECONDS,
        feature: SEPAY_AI_FEATURE,
        metadata: reservationMetadata,
        modelId: input.modelId,
        wsId: input.wsId,
      },
      input.sbAdmin
    );

    if (!reservation.success || !reservation.reservationId) {
      return null;
    }

    let result: T | null = null;

    try {
      result = await input.execute(AbortSignal.timeout(input.timeoutMs));

      const commitResult = await commitFixedAiCreditReservation(
        reservation.reservationId,
        reservationMetadata,
        input.sbAdmin
      );

      if (!commitResult.success) {
        throw new Error(
          `Failed to commit SePay AI credit reservation (${commitResult.errorCode ?? 'UNKNOWN'})`
        );
      }

      return result;
    } catch (error) {
      const releaseResult = await releaseFixedAiCreditReservation(
        reservation.reservationId,
        {
          ...reservationMetadata,
          error: error instanceof Error ? error.message : 'Unknown failure',
        },
        input.sbAdmin
      );

      if (
        !releaseResult.success &&
        releaseResult.errorCode === 'RESERVATION_ALREADY_COMMITTED' &&
        result !== null
      ) {
        return result;
      }

      if (
        !releaseResult.success &&
        releaseResult.errorCode !== 'RESERVATION_ALREADY_COMMITTED'
      ) {
        console.error('Failed to release SePay AI credit reservation:', {
          errorCode: releaseResult.errorCode,
          kind: input.kind,
          reservationId: reservation.reservationId,
        });
      }

      return null;
    }
  } catch (error) {
    console.error('SePay AI enrichment failed before classification:', {
      error: error instanceof Error ? error.message : String(error),
      kind: input.kind,
    });
    return null;
  }
}
