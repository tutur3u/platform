import {
  deductAiCredits,
  recordUnbilledAiCharge,
} from '@tuturuuu/ai/credits/check-credits';
import {
  commitFixedAiCreditReservation,
  releaseFixedAiCreditReservation,
  settleMeteredAiCreditReservation,
} from '@tuturuuu/ai/credits/reservations';
import type { SupabaseClient } from '@tuturuuu/supabase';

const EXPIRED_OR_INACTIVE_RESERVATION_CODES = new Set([
  'RESERVATION_EXPIRED',
  'RESERVATION_NOT_ACTIVE',
  'RESERVATION_NOT_FOUND',
]);
const UNAMBIGUOUS_UNCOMMITTED_RESERVATION_CODES = new Set([
  'RESERVATION_EXPIRED',
  'RESERVATION_NOT_FOUND',
]);

export async function settleOrReleaseChatCreditReservation({
  sbAdmin,
  reservationId,
  wsId,
  userId,
  modelId,
  chatMessageId,
  inputTokens,
  outputTokens,
  reasoningTokens,
  searchCount,
}: {
  sbAdmin: SupabaseClient;
  reservationId: string;
  wsId?: string;
  userId: string;
  modelId: string;
  chatMessageId?: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  searchCount: number;
}): Promise<void> {
  const hasTokenUsage =
    inputTokens > 0 || outputTokens > 0 || reasoningTokens > 0;
  const metadata = {
    source: 'chat_settlement',
    wsId,
    userId,
    ...(chatMessageId ? { chatMessageId } : {}),
  };

  if (!hasTokenUsage && searchCount <= 0) {
    await releaseFixedAiCreditReservation(reservationId, metadata, sbAdmin);
    return;
  }

  if (hasTokenUsage) {
    const settled = await settleMeteredAiCreditReservation(
      reservationId,
      {
        inputTokens,
        outputTokens,
        reasoningTokens,
        metadata,
      },
      sbAdmin
    );

    if (!settled.success) {
      if (
        settled.errorCode &&
        EXPIRED_OR_INACTIVE_RESERVATION_CODES.has(settled.errorCode)
      ) {
        let direct: Awaited<ReturnType<typeof deductAiCredits>>;
        try {
          direct = await deductAiCredits({
            wsId,
            userId,
            modelId,
            inputTokens,
            outputTokens,
            reasoningTokens,
            feature: 'chat',
            chatMessageId,
            ...(searchCount > 0 ? { searchCount } : {}),
          });
        } catch (deductError) {
          console.error('Expired-hold direct chat credit deduction threw.', {
            reservationId,
            wsId,
            userId,
            chatMessageId,
            modelId,
            error: deductError,
          });
          direct = {
            success: false,
            creditsDeducted: 0,
            remainingCredits: 0,
            errorCode: 'DEDUCTION_THROWN',
          };
        }
        if (!direct.success) {
          await recordUnbilledAiCharge({
            wsId,
            userId,
            modelId,
            inputTokens,
            outputTokens,
            reasoningTokens,
            feature: 'chat',
            chatMessageId,
            ...(searchCount > 0 ? { searchCount } : {}),
            errorCode: direct.errorCode ?? 'DEDUCTION_FAILED',
          });
        }
        return;
      }

      // Permanently commit the active reserved hold so a rejected post-stream
      // charge cannot leave a phantom positive balance. Only enqueue a full
      // message-keyed retry when the commit response proves the hold was not
      // committed; ambiguous transport failures (e.g. COMMIT_FAILED) are logged
      // for reconciliation so a landed fixed commit is never double-charged.
      const committed = await commitFixedAiCreditReservation(
        reservationId,
        {
          ...metadata,
          settlementFallback: settled.errorCode ?? 'SETTLEMENT_FAILED',
        },
        sbAdmin
      );
      if (
        !committed.success &&
        committed.errorCode &&
        UNAMBIGUOUS_UNCOMMITTED_RESERVATION_CODES.has(committed.errorCode)
      ) {
        await recordUnbilledAiCharge({
          wsId,
          userId,
          modelId,
          inputTokens,
          outputTokens,
          reasoningTokens,
          feature: 'chat',
          chatMessageId,
          ...(searchCount > 0 ? { searchCount } : {}),
          errorCode: committed.errorCode,
        });
      }
      console.error(
        'Metered chat credit settlement fell back to reservation commit.',
        {
          reservationId,
          wsId,
          userId,
          chatMessageId,
          modelId,
          settlementError: settled.errorCode,
          committedHold: committed.success,
          commitError: committed.errorCode,
        }
      );
      return;
    }
  } else {
    await releaseFixedAiCreditReservation(reservationId, metadata, sbAdmin);
  }

  if (searchCount > 0 && (wsId || userId)) {
    let searchDeduction: Awaited<ReturnType<typeof deductAiCredits>>;
    try {
      searchDeduction = await deductAiCredits({
        wsId,
        userId,
        modelId,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        searchCount,
        feature: 'chat',
        chatMessageId,
      });
    } catch (searchError) {
      console.error('Post-settlement chat search deduction threw.', {
        reservationId,
        wsId,
        userId,
        chatMessageId,
        modelId,
        searchCount,
        error: searchError,
      });
      searchDeduction = {
        success: false,
        creditsDeducted: 0,
        remainingCredits: 0,
        errorCode: 'DEDUCTION_THROWN',
      };
    }
    if (!searchDeduction.success) {
      await recordUnbilledAiCharge({
        wsId,
        userId,
        modelId,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        searchCount,
        feature: 'chat',
        chatMessageId,
        errorCode: searchDeduction.errorCode ?? 'DEDUCTION_FAILED',
      });
    }
  }
}

export function createChatReservationSettlement({
  budget,
  sbAdmin,
  wsId,
  userId,
  modelId,
  chargeKey,
}: {
  budget: { reservationId?: string; reservedCredits?: number };
  sbAdmin: SupabaseClient;
  wsId?: string;
  userId: string;
  modelId: string;
  chargeKey?: string;
}) {
  const reservationId = budget.reservationId;
  const stableChargeKey = chargeKey ?? crypto.randomUUID();
  let finalized = false;

  const release = async () => {
    if (!reservationId || finalized) return;
    finalized = true;
    await releaseFixedAiCreditReservation(
      reservationId,
      { source: 'chat_preflight_release', wsId, userId },
      sbAdmin
    );
  };

  if (!reservationId) {
    if (!budget.reservedCredits || budget.reservedCredits <= 0) {
      return { release, settle: undefined };
    }

    // Paid PAYG fallback runs without a fixed hold, so settle reported usage
    // on every persistence exit (including empty parts and insert failures).
    const settlePayg = async (charge: {
      chatMessageId?: string;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      searchCount: number;
    }) => {
      if (finalized) return;
      finalized = true;
      const hasUsage =
        charge.inputTokens > 0 ||
        charge.outputTokens > 0 ||
        charge.reasoningTokens > 0 ||
        charge.searchCount > 0;
      if (!hasUsage) return;

      let direct: Awaited<ReturnType<typeof deductAiCredits>>;
      try {
        direct = await deductAiCredits({
          wsId,
          userId,
          modelId,
          inputTokens: charge.inputTokens,
          outputTokens: charge.outputTokens,
          reasoningTokens: charge.reasoningTokens,
          feature: 'chat',
          chatMessageId: charge.chatMessageId,
          metadata: {
            source: 'chat_payg_settlement',
            chargeKey: stableChargeKey,
            ...(charge.chatMessageId
              ? { chatMessageId: charge.chatMessageId }
              : {}),
          },
          ...(charge.searchCount > 0
            ? { searchCount: charge.searchCount }
            : {}),
        });
      } catch (deductError) {
        console.error('Paid PAYG chat credit deduction threw.', {
          chargeKey: stableChargeKey,
          wsId,
          userId,
          chatMessageId: charge.chatMessageId,
          modelId,
          error: deductError,
        });
        direct = {
          success: false,
          creditsDeducted: 0,
          remainingCredits: 0,
          errorCode: 'DEDUCTION_THROWN',
        };
      }
      if (!direct.success) {
        const queued = await recordUnbilledAiCharge({
          wsId,
          userId,
          modelId,
          inputTokens: charge.inputTokens,
          outputTokens: charge.outputTokens,
          reasoningTokens: charge.reasoningTokens,
          feature: 'chat',
          chatMessageId: charge.chatMessageId,
          ...(charge.searchCount > 0
            ? { searchCount: charge.searchCount }
            : {}),
          errorCode: direct.errorCode ?? 'DEDUCTION_FAILED',
        });
        if (!queued) {
          console.error('Paid PAYG chat credit settlement failed.', {
            chargeKey: stableChargeKey,
            wsId,
            userId,
            chatMessageId: charge.chatMessageId,
            modelId,
            errorCode: direct.errorCode,
          });
        }
      }
    };

    return { release, settle: settlePayg };
  }

  const settle = async (charge: {
    chatMessageId?: string;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    searchCount: number;
  }) => {
    if (finalized) return;
    finalized = true;
    await settleOrReleaseChatCreditReservation({
      sbAdmin,
      reservationId,
      wsId,
      userId,
      modelId,
      ...charge,
    });
  };

  return { release, settle };
}
