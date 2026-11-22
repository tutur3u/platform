import 'server-only';

import { createHash } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { MastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { mastermindAccessPermission } from '@/lib/mastermind/access';
import {
  type CustomPushMessageInput,
  sendCustomPushMessageBatch,
} from '@/lib/notifications/push-delivery';
import { mastermindPushDeadline } from '../push-events/deadline';
import {
  allowsMastermindPush,
  holdsMastermindPermission,
  MASTERMIND_PUSH_COPY,
  type MastermindPushAdminClient,
  type MastermindPushLocale,
  resolveMastermindPushLocale,
} from '../push-events/delivery';
import { fleetOwnerIds } from './auth';
import type { FleetDecision } from './contract';
import { fleetPushCategory, fleetPushPreference } from './push-categories';
import {
  readFleetAnswers,
  readFleetState,
  type StoredFleetState,
} from './store';

const PREFIX = 'mastermind:fleet:decision-push:';
const FLEET_PUSH_BUDGET_MS = 8_000;
const MAX_CARD_AGE_MS = 60 * 60 * 1000;
const CLAIM_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_CARDS_PER_DAY = 100;
const MAX_DEVICES = 10;
const BATCH_SIZE = 8;

function oneLine(text: string, max: number) {
  const chars = Array.from(text.replace(/\s+/gu, ' ').trim());
  return chars.length > max
    ? `${chars.slice(0, max - 1).join('')}…`
    : chars.join('');
}

export function fleetPushMessage(
  decision: FleetDecision,
  ownerId: string,
  locale: MastermindPushLocale,
  nowMs: number
): CustomPushMessageInput {
  const category = fleetPushCategory(decision.urgency);
  const important = category !== 'fyi';
  return {
    title: oneLine(decision.title, 120),
    body:
      oneLine(decision.body?.trim() || decision.why || '', 160) ||
      MASTERMIND_PUSH_COPY[locale].body,
    category: fleetPushPreference[category],
    androidChannelId: fleetPushPreference[category],
    androidPriority: important ? 'high' : 'normal',
    interruptionLevel: important ? 'time-sensitive' : 'active',
    expiresAt: new Date(nowMs + MAX_CARD_AGE_MS).toISOString(),
    data: {
      openTarget: 'mastermind',
      route: '/mastermind/inbox',
      entityId: decision.id,
      userId: ownerId,
      mastermindCategory: category,
    },
  };
}

export function fleetPushEnabled(env = process.env) {
  return env.MASTERMIND_FLEET_INBOX_PUSH_ENABLED === 'true';
}

function candidatesIn(snapshot: StoredFleetState, nowMs: number) {
  const closed = new Set(snapshot.state.resolved?.map(({ id }) => id));
  const cards = snapshot.state.decisions.filter((card) => {
    const created = Date.parse(card.createdAt);
    return (
      (card.kind === 'ask' || card.kind === 'review') &&
      !closed.has(card.id) &&
      created >= nowMs - MAX_CARD_AGE_MS &&
      created <= nowMs + 5 * 60_000
    );
  });
  return new Map(cards.map((card) => [card.id, card]));
}

async function reserveDailyBudget(
  store: MastermindStore,
  count: number,
  nowMs: number
) {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const key = `${PREFIX}budget:${day}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const prior = await store.get(key);
    const used = Number(prior ?? '0');
    if (!Number.isSafeInteger(used) || used < 0) return 0;
    const granted = Math.min(count, Math.max(0, MAX_CARDS_PER_DAY - used));
    if (granted === 0) return 0;
    if (
      await store.compareAndSet(
        key,
        prior,
        String(used + granted),
        CLAIM_TTL_MS
      )
    )
      return granted;
  }
  return 0;
}

export async function notifyNewFleetDecision(
  store: MastermindStore,
  previous: StoredFleetState | null,
  published: StoredFleetState
) {
  if (!fleetPushEnabled()) return;
  const nowMs = Date.now();
  const priorIds = new Set([
    ...(previous?.state.decisions.map(({ id }) => id) ?? []),
    ...(previous?.state.resolved?.map(({ id }) => id) ?? []),
  ]);
  const ids = [...candidatesIn(published, nowMs).keys()].filter(
    (id) => !priorIds.has(id)
  );
  if (!ids.length) return;

  const ownerIds = fleetOwnerIds();
  const [ownerId] = ownerIds;
  if (!ownerId || ownerIds.length !== 1) {
    console.warn('Mastermind Inbox push requires exactly one configured owner');
    return;
  }

  const deadline = mastermindPushDeadline(FLEET_PUSH_BUDGET_MS);
  const locale = resolveMastermindPushLocale(
    process.env.MASTERMIND_PUSH_LOCALE
  );
  try {
    const admin = await deadline.run(async () =>
      createAdminClient({ noCookie: true })
    );
    // The generated RPC type declares the nullable personal workspace as string.
    const pushAdmin = admin as unknown as MastermindPushAdminClient;
    if (
      !(await deadline.run(() =>
        holdsMastermindPermission(
          pushAdmin,
          ownerId,
          mastermindAccessPermission()
        )
      )) ||
      !(await deadline.run(() => allowsMastermindPush(pushAdmin, ownerId)))
    ) {
      console.info('Mastermind Inbox push owner ineligible');
      return;
    }
    const { data, error } = await deadline.run(() =>
      pushAdmin
        .from('notification_push_devices')
        .select('user_id, token')
        .in('user_id', [ownerId])
        .limit(MAX_DEVICES)
    );
    if (error) throw new Error('Unable to load Mastermind Inbox push devices');
    const devices = [
      ...new Set(
        data
          ?.filter((device) => device.user_id === ownerId)
          .map(({ token }) => token)
      ),
    ].map((token) => ({ token }));
    if (!devices.length) {
      console.info('Mastermind Inbox push has no registered devices');
      return;
    }

    const preferences = await deadline.run(() =>
      Promise.all(
        Object.entries(fleetPushPreference).map(
          async ([category, preference]) =>
            [
              category,
              await allowsMastermindPush(pushAdmin, ownerId, preference),
            ] as const
        )
      )
    );
    const enabled = new Map(preferences);

    for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
      const batch = ids.slice(offset, offset + BATCH_SIZE);
      const current = await deadline.run(() => readFleetState(store));
      if (!current) return;
      const cards = candidatesIn(current, nowMs);
      const candidates = batch.flatMap((id) => {
        const card = cards.get(id);
        return card && enabled.get(fleetPushCategory(card.urgency))
          ? [card]
          : [];
      });
      if (!candidates.length) continue;
      const claimed = await deadline.run(() =>
        Promise.all(
          candidates.map(async (card) => {
            const cardKey = createHash('sha256')
              .update(`fleet:${card.id}`)
              .digest('hex');
            // The existing claim prefix suppresses cards sent before this version.
            const claim = await store.set(`${PREFIX}${cardKey}`, '1', {
              nx: true,
              ttlMs: CLAIM_TTL_MS,
            });
            return claim ? { card, cardKey } : null;
          })
        )
      );
      const available = claimed.filter((entry) => entry !== null);
      if (!available.length) continue;
      const answers = await deadline.run(() => readFleetAnswers(store, batch));
      const open = available.filter(
        ({ card }) => !Object.hasOwn(answers, card.id)
      );
      if (!open.length) continue;
      const count = await deadline.run(() =>
        reserveDailyBudget(store, open.length, nowMs)
      );
      if (count < open.length)
        console.warn('Mastermind Inbox push daily budget reached');
      if (!count) return;

      // Recheck withdrawal after claiming and budget admission. No retries are
      // started after an FCM call, including an uncertain provider response.
      const latest = await deadline.run(() => readFleetState(store));
      if (!latest) return;
      const latestCards = candidatesIn(latest, nowMs);
      const latestAnswers = await deadline.run(() =>
        readFleetAnswers(store, batch)
      );
      const invalidTokens = new Set<string>();
      await deadline.run(() =>
        Promise.all(
          open.slice(0, count).map(async ({ card, cardKey }) => {
            const currentCard = latestCards.get(card.id);
            if (
              !currentCard ||
              Object.hasOwn(latestAnswers, card.id) ||
              !enabled.get(fleetPushCategory(currentCard.urgency))
            )
              return;
            try {
              const result = await sendCustomPushMessageBatch({
                devices,
                message: fleetPushMessage(
                  currentCard,
                  ownerId,
                  locale,
                  Date.now()
                ),
              });
              for (const token of result.invalidTokens)
                invalidTokens.add(token);
              if (!result.deliveredCount) {
                console.warn('Mastermind Inbox push rejected', { cardKey });
                return;
              }
              console.info('Mastermind Inbox push accepted by FCM', {
                cardKey,
                category: fleetPushCategory(currentCard.urgency),
                acceptedDevices: result.deliveredCount,
                createdToPushMs: Date.now() - Date.parse(currentCard.createdAt),
                ingestToPushMs: Date.now() - Date.parse(published.receivedAt),
              });
            } catch {
              console.warn('Mastermind Inbox push outcome unknown', {
                cardKey,
              });
            }
          })
        )
      );
      if (invalidTokens.size) {
        await deadline.run(async () => {
          const { error: cleanupError } = await admin
            .from('notification_push_devices')
            .delete()
            .eq('user_id', ownerId)
            .in('token', [...invalidTokens]);
          if (cleanupError)
            console.warn('Mastermind Inbox push token cleanup failed');
        });
      }
    }
  } finally {
    deadline.cancel();
  }
}
