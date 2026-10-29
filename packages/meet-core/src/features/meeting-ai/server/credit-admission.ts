import 'server-only';
import { checkAiCredits } from '@tuturuuu/ai/credits/check-credits';
import { MEET_AI_MODEL } from '@tuturuuu/ai/meetings/usage';
import { Effect, Either, Schedule } from '@tuturuuu/utils/effect';
import { personalWorkspace } from '../../call/server/room-service';
import { MeetAiError } from './access';

export type MeetCreditAdmission = {
  workspaceId: string;
  allowance: Awaited<ReturnType<typeof checkAiCredits>>;
};

/** Client-safe refusal reasons; anything else stays generic. */
const refusalCodes: Record<string, string> = {
  CREDITS_EXHAUSTED: 'MEET_AI_CREDITS_EXHAUSTED',
  DAILY_LIMIT_REACHED: 'MEET_AI_CREDITS_DAILY_LIMIT',
  MODEL_NOT_ALLOWED: 'MEET_AI_MODEL_NOT_ON_PLAN',
};

class TransientCreditCheck extends Error {}

/**
 * Admit the actor's personal-workspace billing before any chunk row exists, so a
 * refusal never leaves a transcript gap. Only check-infrastructure failures
 * retry: three attempts at most, then a retryable 503 for the client queue.
 */
export async function admitMeetCredits(
  userId: string
): Promise<MeetCreditAdmission> {
  const workspaceId = await personalWorkspace(userId);
  const checked = await Effect.runPromise(
    Effect.either(
      Effect.tryPromise({
        try: async () => {
          const allowance = await checkAiCredits(
            workspaceId,
            `google/${MEET_AI_MODEL}`,
            'generate',
            { userId }
          );
          if (
            !allowance.allowed &&
            allowance.errorCode === 'CREDIT_CHECK_FAILED'
          )
            throw new TransientCreditCheck();
          return allowance;
        },
        catch: (error) => error,
      }).pipe(
        Effect.retry({ times: 2, schedule: Schedule.exponential('200 millis') })
      )
    )
  );
  if (Either.isLeft(checked))
    throw new MeetAiError(
      503,
      'AI credit check unavailable',
      'MEET_AI_CREDIT_CHECK_FAILED'
    );
  const allowance = checked.right;
  if (!allowance.allowed)
    throw new MeetAiError(
      402,
      'AI credits unavailable',
      refusalCodes[allowance.errorCode ?? ''] ?? 'MEET_AI_CREDITS_UNAVAILABLE'
    );
  return { workspaceId, allowance };
}
