import type { TopicAnnouncementsSupabaseClient } from '@tuturuuu/users-core/routes/topic-announcements';
import {
  SCHEDULE_EDITABLE_STATUSES,
  SCHEDULE_SOURCE_TYPE,
} from './schedule-data';

export interface ScheduleSendConflict {
  error: 'ALREADY_SENT' | 'SEND_CONFLICT';
  status: 409;
}

/**
 * Runs an interactive send ("Send now", bulk send) for a schedule session
 * only after claiming it: the row moves from an editable status (or `sent`
 * for a resend) to `processing` before the send reads its recipients, so a
 * GVNN swap in the schedule editor can never interleave with that read. A
 * failed claim is a 409 instead of a send. If the send returns without
 * moving the row on (an early refusal or an error), the claim is released
 * to the previous status.
 *
 * Announcements that are not schedule sessions are sent exactly as before,
 * without a claim.
 */
export async function withScheduleSendClaim<Result>(
  {
    announcementId,
    normalizedWsId,
    resend,
    sbAdmin,
  }: {
    announcementId: string;
    normalizedWsId: string;
    resend: boolean;
    sbAdmin: TopicAnnouncementsSupabaseClient;
  },
  send: () => Promise<Result>
): Promise<Result | ScheduleSendConflict> {
  const { data: row, error } = await sbAdmin
    .from('topic_announcements')
    .select('status,source_type')
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.source_type !== SCHEDULE_SOURCE_TYPE) return send();
  const previousStatus: string = row.status;

  const claimable: string[] = [
    ...SCHEDULE_EDITABLE_STATUSES,
    ...(resend ? ['sent'] : []),
  ];
  const conflict: ScheduleSendConflict = {
    error:
      previousStatus === 'sent' && !resend ? 'ALREADY_SENT' : 'SEND_CONFLICT',
    status: 409,
  };
  if (!claimable.includes(previousStatus)) return conflict;
  // Claim exactly the status read above, so releasing restores what was
  // really there (a status that changed in between fails the claim instead).
  const { data: claimed, error: claimError } = await sbAdmin
    .from('topic_announcements')
    .update({ status: 'processing' })
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId)
    .eq('source_type', SCHEDULE_SOURCE_TYPE)
    .eq('status', previousStatus)
    .select('id');
  if (claimError) throw claimError;
  if ((claimed ?? []).length === 0) return conflict;

  try {
    return await send();
  } finally {
    const { error: releaseError } = await sbAdmin
      .from('topic_announcements')
      .update({ status: previousStatus })
      .eq('id', announcementId)
      .eq('ws_id', normalizedWsId)
      .eq('status', 'processing');
    if (releaseError) {
      console.error('Failed to release a schedule send claim', {
        announcementId,
        error: releaseError,
      });
    }
  }
}

/**
 * Queue sends of schedule sessions that found no recipient would otherwise
 * stay `processing`, be reset to `queued` and retried forever. Mark them
 * `failed` with NO_RECIPIENTS instead: an editable status the supervisor
 * can fix by assigning a GVNN. Other announcements are not touched.
 */
export async function failScheduleSendWithoutRecipients({
  announcementId,
  sbAdmin,
  wsId,
}: {
  announcementId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  wsId: string;
}) {
  const { error } = await sbAdmin
    .from('topic_announcements')
    .update({ last_error: 'NO_RECIPIENTS', status: 'failed' })
    .eq('id', announcementId)
    .eq('ws_id', wsId)
    .eq('source_type', SCHEDULE_SOURCE_TYPE)
    .eq('status', 'processing');
  if (error) throw error;
}

/**
 * Schedule sessions have no `scheduled_send_at`, so the queue's stale reset
 * never sees a Send-now claim whose function died (or whose release write
 * failed). Sessions left `processing` past the cutoff are marked `failed`
 * with PROCESSING_TIMEOUT: editable, and never sent automatically. Scheduled
 * sends and other announcements keep the queue's own reset.
 */
export async function failStaleScheduleClaims({
  cutoff,
  sbAdmin,
}: {
  cutoff: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  const { error } = await sbAdmin
    .from('topic_announcements')
    .update({ last_error: 'PROCESSING_TIMEOUT', status: 'failed' })
    .eq('source_type', SCHEDULE_SOURCE_TYPE)
    .eq('status', 'processing')
    .is('scheduled_send_at', null)
    .lt('updated_at', cutoff);
  if (error) throw error;
}
