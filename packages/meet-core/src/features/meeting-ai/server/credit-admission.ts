import 'server-only';
import { checkAiCredits } from '@tuturuuu/ai/credits/check-credits';
import { MEET_AI_MODEL } from '@tuturuuu/ai/meetings/usage';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Effect, Either, Schedule } from '@tuturuuu/utils/effect';
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
 * Admit the meeting workspace's billing before any chunk row exists, so a
 * refusal never leaves a transcript gap. Only check-infrastructure failures
 * retry: three attempts at most, then a retryable 503 for the client queue.
 */
export async function admitMeetCredits(
  userId: string,
  meetingId: string
): Promise<MeetCreditAdmission> {
  const db = await createAdminClient({ noCookie: true });
  const { data: meeting, error } = await db
    .from('workspace_meetings')
    .select('ws_id')
    .eq('id', meetingId)
    .maybeSingle();
  if (error)
    throw new MeetAiError(503, 'Meeting billing workspace unavailable');
  if (!meeting) throw new MeetAiError(404, 'Meeting not found');
  const workspaceId = meeting.ws_id;
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
      allowance.errorCode === 'CREDITS_EXHAUSTED'
        ? 'The meeting workspace is out of AI credits'
        : 'AI credits unavailable for the meeting workspace',
      refusalCodes[allowance.errorCode ?? ''] ?? 'MEET_AI_CREDITS_UNAVAILABLE'
    );
  return { workspaceId, allowance };
}
