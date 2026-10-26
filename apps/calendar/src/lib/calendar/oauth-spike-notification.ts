import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import en from '../../../messages/en.json';
import vi from '../../../messages/vi.json';
import {
  type CalendarTokenOutcomeEntry,
  summarizeCalendarTokenOutcomes,
} from './oauth-token-health';

const RECIPIENTS_ENV = 'CALENDAR_OAUTH_ALERT_RECIPIENTS';
export const MAX_SPIKE_ALERT_RECIPIENTS = 5;

type NotificationArgs =
  Database['public']['Functions']['create_notification']['Args'];
type NotificationClient = {
  rpc(
    fn: 'create_notification',
    args: NotificationArgs
  ): PromiseLike<{
    data: string | null;
    error: { code?: string } | null;
  }>;
};

export type CalendarSpikeDelivery =
  | { status: 'unconfigured'; queued: 0; failed: 0; unknown: 0 }
  | {
      status: 'queued' | 'partial' | 'failed' | 'unknown';
      queued: number;
      failed: number;
      unknown: number;
    };

/** Deliver aggregate-only operator alerts through the existing notification queue. */
export async function queueCalendarOAuthSpikeAlert(
  outcomes: CalendarTokenOutcomeEntry[],
  options: {
    env?: Partial<Record<typeof RECIPIENTS_ENV, string>>;
    client?: NotificationClient;
  } = {}
): Promise<CalendarSpikeDelivery> {
  const recipients = [
    ...new Set(
      ((options.env ?? process.env)[RECIPIENTS_ENV] ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value))
    ),
  ].slice(0, MAX_SPIKE_ALERT_RECIPIENTS);
  if (recipients.length === 0) {
    console.error('calendar.oauth.spike_delivery_unconfigured');
    return { status: 'unconfigured', queued: 0, failed: 0, unknown: 0 };
  }
  const counts = summarizeCalendarTokenOutcomes(outcomes);
  const summary = `${counts.deactivated}/${counts.deactivation_deferred}/${counts.consensus_hold}/${counts.systemic}/${counts.transient}`;
  let queued = 0;
  let failed = 0;
  let unknown = 0;
  const signal = AbortSignal.timeout(5_000);
  try {
    const client =
      options.client ??
      (await createAdminClient({
        noCookie: true,
        fetch: (input, init) => fetch(input, { ...init, signal }),
      }));
    for (const email of recipients) {
      try {
        const result = await client.rpc('create_notification', {
          p_ws_id: ROOT_WORKSPACE_ID,
          p_email: email,
          p_type: 'account_update',
          p_code: 'calendar_oauth_health_spike',
          p_scope: 'user',
          p_priority: 'high',
          p_title: `${en.calendar.oauth_spike_alert_title} / ${vi.calendar.oauth_spike_alert_title}`,
          p_description: `${en.calendar.oauth_spike_alert_description}: ${summary}.\n${vi.calendar.oauth_spike_alert_description}: ${summary}.`,
          p_entity_type: 'calendar_oauth_health',
          p_data: {
            event: 'calendar.oauth.deactivation_spike',
            counts,
            evaluated: outcomes.length,
          },
        });
        if (!result.error && result.data) queued += 1;
        else failed += 1;
      } catch {
        // A timed-out write may have queued the alert. Never replay it here.
        unknown += 1;
      }
    }
  } catch {
    // No client was acquired, so no notification write was dispatched.
    failed = recipients.length;
  }
  const status =
    failed + unknown === 0
      ? 'queued'
      : queued > 0
        ? 'partial'
        : unknown > 0
          ? 'unknown'
          : 'failed';
  if (failed + unknown)
    console.error('calendar.oauth.spike_delivery_failed', {
      queued,
      failed,
      unknown,
    });
  return { status, queued, failed, unknown };
}
