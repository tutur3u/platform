import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { CALENDAR_OAUTH_SPIKE_COPY } from './oauth-spike-copy';
import {
  type CalendarTokenOutcomeEntry,
  summarizeCalendarTokenOutcomes,
} from './oauth-token-health';

const RECIPIENTS_ENV = 'CALENDAR_OAUTH_ALERT_RECIPIENTS';
export const MAX_SPIKE_ALERT_RECIPIENTS = 5;

type DeliveryCounts = {
  queued: number;
  failed: number;
  unknown: number;
  unresolved: number;
  suppressed: number;
};
export type CalendarSpikeDelivery = DeliveryCounts & {
  status: keyof DeliveryCounts | 'partial' | 'unconfigured';
};

/** Queue aggregate alerts only for confirmed root-workspace operator accounts. */
export async function queueCalendarOAuthSpikeAlert(
  outcomes: CalendarTokenOutcomeEntry[],
  options: { env?: Partial<Record<typeof RECIPIENTS_ENV, string>> } = {}
): Promise<CalendarSpikeDelivery> {
  const recipients = [
    ...new Set(
      ((options.env ?? process.env)[RECIPIENTS_ENV] ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value))
    ),
  ].slice(0, MAX_SPIKE_ALERT_RECIPIENTS);
  const delivery: DeliveryCounts = {
    queued: 0,
    failed: 0,
    unknown: 0,
    unresolved: 0,
    suppressed: 0,
  };
  if (recipients.length === 0) {
    console.error('calendar.oauth.spike_delivery_unconfigured');
    return { status: 'unconfigured', ...delivery };
  }
  const counts = summarizeCalendarTokenOutcomes(outcomes);
  const summary = `${counts.deactivated}/${counts.deactivation_deferred}/${counts.consensus_hold}/${counts.systemic}/${counts.transient}`;
  const signal = AbortSignal.timeout(5_000);
  try {
    const client = await createAdminClient({
      noCookie: true,
      fetch: (input, init) => fetch(input, { ...init, signal }),
    });
    for (const email of recipients) {
      if (signal.aborted) {
        delivery.failed += 1;
        continue;
      }
      try {
        const profile = await client
          .from('user_private_details')
          .select('user_id,deleted')
          .eq('email', email)
          .retry(false)
          .limit(2);
        if (profile.error) {
          delivery.failed += 1;
          continue;
        }
        const candidate =
          profile.data?.length === 1 ? profile.data[0] : undefined;
        if (!candidate || candidate.deleted === true) {
          delivery.unresolved += 1;
          continue;
        }
        const member = await client
          .from('workspace_members')
          .select('user_id')
          .eq('ws_id', ROOT_WORKSPACE_ID)
          .eq('user_id', candidate.user_id)
          .retry(false)
          .maybeSingle();
        if (member.error) {
          delivery.failed += 1;
          continue;
        }
        if (!member.data) {
          delivery.unresolved += 1;
          continue;
        }
        const identity = await client.auth.admin.getUserById(candidate.user_id);
        if (identity.error) {
          delivery.failed += 1;
          continue;
        }
        const user = identity.data.user;
        if (
          !user?.email_confirmed_at ||
          user.id !== candidate.user_id ||
          user.email?.trim().toLowerCase() !== email
        ) {
          delivery.unresolved += 1;
          continue;
        }
        if (signal.aborted) {
          delivery.failed += 1;
          continue;
        }
        // No reads or other fallible work after dispatch: status 0 is an unknown write.
        try {
          const result = await client.rpc('create_notification', {
            p_ws_id: ROOT_WORKSPACE_ID,
            p_user_id: user.id,
            p_type: 'account_update',
            p_code: 'calendar_oauth_health_spike',
            p_scope: 'user',
            p_priority: 'high',
            p_title: `${CALENDAR_OAUTH_SPIKE_COPY.en.title} / ${CALENDAR_OAUTH_SPIKE_COPY.vi.title}`,
            p_description: `${CALENDAR_OAUTH_SPIKE_COPY.en.description}: ${summary}.\n${CALENDAR_OAUTH_SPIKE_COPY.vi.description}: ${summary}.`,
            p_entity_type: 'calendar_oauth_health',
            p_data: {
              event: 'calendar.oauth.deactivation_spike',
              counts,
              evaluated: outcomes.length,
            },
          });
          if (result.status === 0) delivery.unknown += 1;
          else if (result.error) delivery.failed += 1;
          else if (result.data === null) delivery.suppressed += 1;
          else delivery.queued += 1;
        } catch {
          // A thrown transport error may follow a committed write. Never replay it.
          delivery.unknown += 1;
        }
      } catch {
        // Recipient resolution failed before any notification write.
        delivery.failed += 1;
      }
    }
  } catch {
    delivery.failed = recipients.length;
  }
  const status =
    delivery.queued === recipients.length
      ? 'queued'
      : delivery.suppressed === recipients.length
        ? 'suppressed'
        : delivery.unresolved === recipients.length
          ? 'unresolved'
          : delivery.unknown === recipients.length
            ? 'unknown'
            : delivery.failed === recipients.length
              ? 'failed'
              : 'partial';
  if (delivery.failed + delivery.unknown + delivery.unresolved)
    console.error('calendar.oauth.spike_delivery_incomplete', delivery);
  return { status, ...delivery };
}
