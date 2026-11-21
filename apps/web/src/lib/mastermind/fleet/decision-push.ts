import 'server-only';

import { createHash } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { MastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import {
  deliverMastermindPushEvent,
  type MastermindPushAdminClient,
  MASTERMIND_PUSH_COALESCE_SECONDS,
  resolveMastermindPushLocale,
} from '../push-events/delivery';
import { MASTERMIND_PUSH_REPLAY_SECONDS } from '../push-events/claims';
import { mastermindPushDeadline } from '../push-events/deadline';
import { mastermindPushRedis } from '../store';
import { fleetOwnerIds } from './auth';
import {
  readFleetAnswers,
  readFleetState,
  type StoredFleetState,
} from './store';

const FLEET_PUSH_BUDGET_MS = 5000;
const PREFIX = 'mastermind:fleet:decision-push:';

export async function notifyNewFleetDecision(
  store: MastermindStore,
  previous: StoredFleetState | null,
  published: StoredFleetState
) {
  const priorIds = new Set(previous?.state.decisions.map(({ id }) => id));
  const newIds = new Set(
    published.state.decisions
      .map(({ id }) => id)
      .filter((id) => !priorIds.has(id))
  );
  if (!newIds.size) return;

  const ownerIds = fleetOwnerIds();
  if (!ownerIds.length) return;

  const deadline = mastermindPushDeadline(FLEET_PUSH_BUDGET_MS);
  try {
    const current = await deadline.run(() => readFleetState(store));
    const candidates = current?.state.decisions.filter(({ id }) =>
      newIds.has(id)
    );
    if (!candidates?.length) return;

    const answers = await deadline.run(() =>
      readFleetAnswers(
        store,
        candidates.map(({ id }) => id)
      )
    );
    const unanswered = candidates
      .filter(({ id }) => !Object.hasOwn(answers, id))
      .map(({ id, title }) => {
        const digest = createHash('sha256').update(`fleet:${id}`).digest('hex');
        return { title, digest, key: `${PREFIX}${digest}` };
      });
    if (!unanswered.length) return;
    const claims = await deadline.run(() =>
      store.mget(unanswered.map(({ key }) => key))
    );
    const decision = unanswered.find((_, index) => claims[index] === null);
    if (!decision) return;

    // Share the admission window across Web instances. Extra decisions
    // remain in the Inbox.
    const admitted = await deadline.run(() =>
      store.set(`${PREFIX}window`, '1', {
        nx: true,
        ttlMs: MASTERMIND_PUSH_COALESCE_SECONDS * 1000,
      })
    );
    if (!admitted) return;

    // Claim before contacting FCM. An uncertain send must not cause a second
    // attempt when a concurrent publish or a reintroduced decision repeats it.
    const claimed = await deadline.run(() =>
      store.set(decision.key, '1', {
        nx: true,
        ttlMs: MASTERMIND_PUSH_REPLAY_SECONDS * 1000,
      })
    );
    if (!claimed) return;

    const admin = await deadline.run(() =>
      createAdminClient({ noCookie: true })
    );
    const result = await deliverMastermindPushEvent({
      admin: admin as unknown as MastermindPushAdminClient,
      event: {
        v: 1,
        type: 'decision.awaiting',
        item_id: `item-${decision.digest.slice(0, 20)}`,
        seq: 0,
        ts: published.receivedAt,
      },
      ownerIds,
      redis: mastermindPushRedis(store),
      locale: resolveMastermindPushLocale(process.env.MASTERMIND_PUSH_LOCALE),
      fleetDecisionTitle: decision.title,
      deadline,
    });
    if (result.failed) console.warn('Mastermind fleet decision push failed');
  } finally {
    deadline.cancel();
  }
}
