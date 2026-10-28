import 'server-only';

import type { UpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import {
  type CustomPushMessageInput,
  sendCustomPushMessageBatch,
} from '@/lib/notifications/push-delivery';
import {
  MASTERMIND_PUSH_REPLAY_SECONDS,
  releaseMastermindPushClaim,
} from './claims';
import {
  MastermindPushDeadlineExceeded,
  mastermindPushDeadline,
} from './deadline';
import {
  type MastermindPushEvent,
  type MastermindPushEventType,
  mastermindPushEventKey,
} from './schema';

export const MASTERMIND_PUSH_COALESCE_SECONDS = 60;
export const MASTERMIND_PUSH_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_OWNERS = 50;
const MAX_DEVICES = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tab roots only; an item id never enters the deep link. */
const ROUTES: Record<MastermindPushEventType, string> = {
  'needs_you.new': '/mastermind/inbox',
  'decision.awaiting': '/mastermind/inbox',
  'pin_batch.new': '/mastermind',
};

/** Fixed copy: the event carries no text, so nothing else can be shown. */
export const MASTERMIND_PUSH_COPY = {
  en: { title: 'Mastermind', body: 'Open Mastermind' },
  vi: { title: 'Mastermind', body: 'Mở Mastermind' },
} as const;

export type MastermindPushLocale = keyof typeof MASTERMIND_PUSH_COPY;

export function resolveMastermindPushLocale(
  raw: string | undefined
): MastermindPushLocale {
  return raw?.trim().toLowerCase() === 'vi' ? 'vi' : 'en';
}

type QueryResult<T> = PromiseLike<{ data: T | null; error: unknown }>;

export interface MastermindPushAdminClient {
  from(table: 'notification_push_devices'): {
    select(columns: 'user_id, token'): {
      in(
        column: 'user_id',
        values: string[]
      ): {
        limit(
          count: number
        ): QueryResult<Array<{ user_id: string; token: string }>>;
      };
    };
    delete(): {
      eq(
        column: 'user_id',
        value: string
      ): { in(column: 'token', values: string[]): PromiseLike<unknown> };
    };
  };
  rpc(
    name: 'should_send_notification',
    args: {
      p_user_id: string;
      p_event_type: string;
      p_channel: string;
      p_scope: string;
      p_ws_id: string | null;
    }
  ): QueryResult<unknown>;
}

export interface MastermindPushDeliveryResult {
  sent: number;
  coalesced: number;
  skipped: number;
  failed: number;
}

export function parseMastermindPushOwnerIds(raw: string | undefined) {
  const ids = (raw ?? '')
    .split(/[\s,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => UUID.test(value));
  return [...new Set(ids)].slice(0, MAX_OWNERS);
}

export function buildMastermindPushMessage(
  type: MastermindPushEventType,
  locale: MastermindPushLocale = 'en',
  nowMs = Date.now()
): CustomPushMessageInput {
  return {
    ...MASTERMIND_PUSH_COPY[locale],
    category: 'tuturuuu_mastermind',
    expiresAt: new Date(nowMs + MASTERMIND_PUSH_TTL_MS).toISOString(),
    data: { openTarget: 'mastermind', route: ROUTES[type] },
  };
}

async function allowsPush(admin: MastermindPushAdminClient, userId: string) {
  const { data, error } = await admin.rpc('should_send_notification', {
    p_user_id: userId,
    p_event_type: 'push_notifications',
    p_channel: 'push',
    p_scope: 'user',
    p_ws_id: null,
  });
  // An unreadable preference is treated as opted out.
  return !error && data === true;
}

/**
 * Synchronous fan-out only: no scheduling, retries or deferred work here.
 * Coalescing drops repeats inside the window; the snapshot carries the rest.
 * An owner counts as sent only when FCM reports at least one delivery; a
 * failed owner's window is released with its token. Per-event receipts keep
 * successful owners out of retries for 24 hours, even after coalescing expires.
 */
export async function deliverMastermindPushEvent({
  admin,
  event,
  ownerIds,
  redis,
  locale = 'en',
  nowMs = Date.now(),
}: {
  admin: MastermindPushAdminClient;
  event: MastermindPushEvent;
  ownerIds: string[];
  redis: UpstashRestRedisClient;
  locale?: MastermindPushLocale;
  nowMs?: number;
}): Promise<MastermindPushDeliveryResult> {
  const result = { sent: 0, coalesced: 0, skipped: 0, failed: 0 };
  if (ownerIds.length === 0) return result;

  const deadline = mastermindPushDeadline();
  try {
    const { data: devices, error } = await deadline.run(() =>
      admin
        .from('notification_push_devices')
        .select('user_id, token')
        .in('user_id', ownerIds)
        .limit(MAX_DEVICES)
    );
    if (error) throw new Error('Unable to load Mastermind push devices');

    const tokensByUser = new Map<string, Array<{ token: string }>>();
    for (const device of devices ?? []) {
      const userId = device.user_id?.toLowerCase();
      if (!userId || !ownerIds.includes(userId)) continue;
      tokensByUser.set(userId, [
        ...(tokensByUser.get(userId) ?? []),
        { token: device.token },
      ]);
    }

    const message = buildMastermindPushMessage(event.type, locale, nowMs);
    for (const userId of ownerIds) {
      await deliverOwner(userId);
    }

    async function deliverOwner(userId: string) {
      const sentKey = `mastermind:push:event:${mastermindPushEventKey(event)}:sent:${userId}`;
      if (await deadline.run(() => redis.get(sentKey))) {
        result.skipped += 1;
        return;
      }
      const userDevices = tokensByUser.get(userId);
      if (
        !userDevices?.length ||
        !(await deadline.run(() => allowsPush(admin, userId)))
      ) {
        result.skipped += 1;
        return;
      }

      const coalesceKey = `mastermind:push:coalesce:${userId}:${event.type}`;
      const coalesceToken = `pending:${crypto.randomUUID()}`;
      const claimed = await deadline.run(() =>
        redis.set(coalesceKey, coalesceToken, {
          ex: MASTERMIND_PUSH_COALESCE_SECONDS,
          nx: true,
        })
      );
      if (claimed !== 'OK') {
        result.coalesced += 1;
        return;
      }

      let deliveredCount = 0;
      let invalidTokens: string[] = [];
      try {
        ({ deliveredCount, invalidTokens } = await deadline.run(() =>
          sendCustomPushMessageBatch({
            devices: userDevices,
            message,
          })
        ));
      } catch (error) {
        if (error instanceof MastermindPushDeadlineExceeded) throw error;
        deliveredCount = 0;
      }
      if (deliveredCount > 0) {
        await deadline.run(() =>
          redis.set(sentKey, '1', { ex: MASTERMIND_PUSH_REPLAY_SECONDS })
        );
        result.sent += 1;
      } else {
        // A stale attempt must never delete a newer owner window.
        await deadline.run(() =>
          releaseMastermindPushClaim(redis, coalesceKey, coalesceToken)
        );
        result.failed += 1;
      }
      if (invalidTokens.length) {
        await deadline.run(() =>
          Promise.resolve(
            admin
              .from('notification_push_devices')
              .delete()
              .eq('user_id', userId)
              .in('token', invalidTokens)
          ).catch(() =>
            console.warn('Failed to remove invalid Mastermind push tokens')
          )
        );
      }
    }
    return result;
  } catch (error) {
    if (!(error instanceof MastermindPushDeadlineExceeded)) throw error;
    result.failed +=
      ownerIds.length -
      result.sent -
      result.skipped -
      result.coalesced -
      result.failed;
    return result;
  } finally {
    deadline.cancel();
  }
}
