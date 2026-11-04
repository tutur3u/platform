import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import type {
  DeliveryOutcome,
  PolicyNoticeStore,
  Recipient,
  Suppression,
} from './types';

const suppressionSchema = z
  .enum(['complaint', 'hard_bounce', 'blocked', 'unsubscribed'])
  .nullable();
const recipientsSchema = z.array(
  z.object({
    recipient_hash: z.string().regex(/^[0-9a-f]{64}$/),
    email: z.string().min(3),
    suppression: suppressionSchema,
  })
);
const count = z.number().int().nonnegative();
const countsSchema = z.array(
  z.object({
    eligible: count,
    suppressed: count,
    already_sent: count,
    previously_failed: count,
    excluded_personal_only: count,
  })
);
const healthSchema = z.array(
  z.object({
    attempted: count,
    rejected: count,
    unknown: count,
    hard_bounces: count,
    complaints: count,
  })
);

type RpcResult = { data: unknown; error: { message?: string } | null };

/** Supabase-backed ledger: the private.policy_notice_* functions. */
export function createSupabasePolicyNoticeStore(
  sbAdmin: TypedSupabaseClient
): PolicyNoticeStore {
  // The private ledger functions are not in the generated public types.
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = (await sbAdmin
      .schema('private')
      .rpc(name as never, args as never)) as RpcResult;
    if (error) throw new Error(error.message ?? `${name} failed`);
    return data;
  };
  const recipients = (data: unknown): Recipient[] =>
    recipientsSchema.parse(data).map((row) => ({
      recipientHash: row.recipient_hash,
      email: row.email,
      suppression: row.suppression,
    }));

  return {
    async counts(input) {
      const [row] = countsSchema.parse(
        await rpc('policy_notice_counts', {
          p_notice_id: input.noticeId,
          p_notice_version: input.version,
        })
      );
      if (!row) throw new Error('policy_notice_counts returned no row');
      return {
        eligible: row.eligible,
        suppressed: row.suppressed,
        alreadySent: row.already_sent,
        previouslyFailed: row.previously_failed,
        excludedPersonalOnly: row.excluded_personal_only,
      };
    },
    async startRun(input) {
      return z.uuid().parse(
        await rpc('policy_notice_start_run', {
          p_notice_id: input.noticeId,
          p_notice_version: input.version,
          p_mode: input.mode,
          p_actor: input.actorId,
        })
      );
    },
    async finishRun(runId, status, stopReason, counts) {
      await rpc('policy_notice_finish_run', {
        p_run_id: runId,
        p_status: status,
        p_stop_reason: stopReason,
        p_counts: counts,
      });
    },
    async nextRecipients(input) {
      return recipients(
        await rpc('policy_notice_next_recipients', {
          p_notice_id: input.noticeId,
          p_notice_version: input.version,
          p_limit: input.limit,
        })
      );
    },
    async classify(emails) {
      return recipients(
        await rpc('policy_notice_classify', { p_emails: emails })
      );
    },
    async claim(runId, recipientHash, suppression: Suppression | null) {
      return z.boolean().parse(
        await rpc('policy_notice_claim', {
          p_run_id: runId,
          p_recipient_hash: recipientHash,
          p_suppression: suppression,
        })
      );
    },
    async record(runId, recipientHash, outcome: DeliveryOutcome) {
      return z.boolean().parse(
        await rpc('policy_notice_record', {
          p_run_id: runId,
          p_recipient_hash: recipientHash,
          p_status: outcome.status,
          p_suppression:
            outcome.status === 'suppressed' ? outcome.suppression : null,
          p_ses_message_id:
            outcome.status === 'sent' ? outcome.messageId : null,
        })
      );
    },
    async health(noticeId, version) {
      const [row] = healthSchema.parse(
        await rpc('policy_notice_health', {
          p_notice_id: noticeId,
          p_notice_version: version,
        })
      );
      if (!row) throw new Error('policy_notice_health returned no row');
      return {
        attempted: row.attempted,
        rejected: row.rejected,
        unknown: row.unknown,
        hardBounces: row.hard_bounces,
        complaints: row.complaints,
      };
    },
  };
}
