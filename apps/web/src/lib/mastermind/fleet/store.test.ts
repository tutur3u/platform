import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { describe, expect, it } from 'vitest';
import {
  acknowledgeFleetAnswers,
  answerableDecisionIds,
  claimFleetNonce,
  pendingFleetAnswers,
  readFleetAnswers,
  readFleetState,
  recordFleetAnswer,
  replayFleetAnswer,
  StaleFleetSnapshotError,
  writeFleetState,
} from './store';
import { fleetStateSchema } from './contract';
import { sampleFleetState } from './sample-state.fixture';

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync
describe('fleet store', () => {
  it('writes and reads the snapshot with a content etag', async () => {
    const store = createMemoryMastermindStore();
    const state = fleetStateSchema.parse(sampleFleetState());
    const stored = await writeFleetState(store, state);
    expect(await readFleetState(store)).toEqual(stored);
    const later = await writeFleetState(store, {
      ...state,
      generatedAt: '2026-11-20T03:05:00.000Z',
    });
    expect(later.etag).toBe(stored.etag);
  });

  it('keeps decisions answerable for 48 hours after they close', async () => {
    const store = createMemoryMastermindStore();
    const state = fleetStateSchema.parse(sampleFleetState());
    const t0 = new Date('2026-11-20T03:00:00.000Z');
    await writeFleetState(store, state, t0);
    const closed = await writeFleetState(
      store,
      { ...state, decisions: [] },
      new Date(t0.getTime() + 60 * 60_000)
    );
    expect(await answerableDecisionIds(store, closed)).toEqual([
      'ship-fleet-sync',
    ]);
    const later = await writeFleetState(
      store,
      { ...state, decisions: [] },
      new Date(t0.getTime() + 50 * 60 * 60_000)
    );
    expect(await answerableDecisionIds(store, later)).toEqual([]);
  });

  it('counts decisions as seen until the publish that drops them', async () => {
    const store = createMemoryMastermindStore();
    const state = fleetStateSchema.parse(sampleFleetState());
    // A snapshot written before the recent list existed, then a long outage.
    await store.set(
      'mastermind:fleet:v1:state',
      JSON.stringify({
        state,
        etag: '"x"',
        receivedAt: '2026-11-18T00:00:00.000Z',
      }),
      { ttlMs: 60_000 }
    );
    const dropped = await writeFleetState(
      store,
      { ...state, decisions: [] },
      new Date('2026-11-21T00:00:00.000Z')
    );
    expect(await answerableDecisionIds(store, dropped)).toEqual([
      'ship-fleet-sync',
    ]);
  });

  it('keeps closed decisions apart from the open ones it lists', async () => {
    const store = createMemoryMastermindStore();
    const base = fleetStateSchema.parse(sampleFleetState());
    const decision = base.decisions[0]!;
    const t0 = new Date('2026-11-20T03:00:00.000Z');
    const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
    const open = Array.from({ length: 50 }, (_, i) => ({
      ...decision,
      id: `open-${i}`,
    }));
    await writeFleetState(
      store,
      { ...base, decisions: [...open, { ...decision, id: 'answered' }] },
      at(0)
    );
    // The answered decision closes, then 150 more open and close.
    for (let i = 0; i < 150; i++)
      await writeFleetState(
        store,
        { ...base, decisions: [...open, { ...decision, id: `c${i}` }] },
        at(i + 1)
      );
    const stored = await writeFleetState(
      store,
      { ...base, decisions: open },
      at(200)
    );
    expect(await answerableDecisionIds(store, stored)).toContain('answered');
  });

  it('never lets an unstored id take a closed slot', async () => {
    const store = createMemoryMastermindStore();
    const base = fleetStateSchema.parse(sampleFleetState());
    const decision = base.decisions[0]!;
    const t0 = new Date('2026-11-20T03:00:00.000Z');
    const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
    const set = store.set.bind(store);
    // The snapshot write fails once, after the recent list was updated.
    let fail = false;
    store.set = async (key, value, options) => {
      if (fail && key === 'mastermind:fleet:v1:state') {
        fail = false;
        throw new Error('store down');
      }
      return set(key, value, options);
    };
    await writeFleetState(store, { ...base, decisions: [] }, at(0));
    fail = true;
    await expect(
      writeFleetState(
        store,
        {
          ...base,
          generatedAt: at(1).toISOString(),
          decisions: [{ ...decision, id: 'never-stored' }],
        },
        at(1)
      )
    ).rejects.toThrow();
    const stored = await writeFleetState(
      store,
      { ...base, generatedAt: at(2).toISOString(), decisions: [] },
      at(2)
    );
    expect(await answerableDecisionIds(store, stored)).toEqual([]);
  });

  it('refuses a snapshot older than the newest accepted', async () => {
    const store = createMemoryMastermindStore();
    const base = fleetStateSchema.parse(sampleFleetState());
    await writeFleetState(
      store,
      {
        ...base,
        generatedAt: '2026-11-20T03:05:00.000Z',
      },
      new Date('2026-11-20T03:05:00.000Z')
    );
    await expect(
      writeFleetState(
        store,
        { ...base, generatedAt: '2026-11-20T03:04:00.000Z' },
        new Date('2026-11-20T03:05:01.000Z')
      )
    ).rejects.toBeInstanceOf(StaleFleetSnapshotError);
  });

  it('never sends the snapshot through a compare-and-set', async () => {
    const store = createMemoryMastermindStore();
    const keys: string[] = [];
    const cas = store.compareAndSet.bind(store);
    store.compareAndSet = async (key, expect, value, ttl) => {
      keys.push(key);
      return cas(key, expect, value, ttl);
    };
    await writeFleetState(store, fleetStateSchema.parse(sampleFleetState()));
    expect(keys).toEqual(['mastermind:fleet:v1:recent']);
  });

  it('retries the write when another publish lands in between', async () => {
    const store = createMemoryMastermindStore();
    const state = fleetStateSchema.parse(sampleFleetState());
    const t0 = new Date('2026-11-20T03:00:00.000Z');
    const cas = store.compareAndSet.bind(store);
    let raced = false;
    store.compareAndSet = async (key, expect, value, ttl) => {
      if (!raced) {
        raced = true;
        // A concurrent publish writes a snapshot with another decision.
        await writeFleetState(
          store,
          {
            ...state,
            decisions: [{ ...state.decisions[0]!, id: 'other-decision' }],
          },
          t0
        );
      }
      return cas(key, expect, value, ttl);
    };
    const stored = await writeFleetState(
      store,
      { ...state, decisions: [] },
      new Date(t0.getTime() + 60_000)
    );
    expect(await answerableDecisionIds(store, stored)).toContain(
      'other-decision'
    );
  });

  it('claims a nonce once', async () => {
    const store = createMemoryMastermindStore();
    expect(await claimFleetNonce(store, 'sig')).toBe(true);
    expect(await claimFleetNonce(store, 'sig')).toBe(false);
  });

  it('replays only the same actor, key and payload', async () => {
    const store = createMemoryMastermindStore();
    const reply = { action: 'reply' as const, text: 'Wait' };
    const recorded = await recordFleetAnswer(
      store,
      'ship',
      reply,
      'key-1',
      new Date('2026-11-20T03:00:00.000Z'),
      'owner-a'
    );
    expect(recorded.actorId).toBe('owner-a');
    expect(
      await replayFleetAnswer(store, 'ship', reply, 'key-1', 'owner-a')
    ).toMatchObject({ revision: 1, action: 'reply', text: 'Wait' });
    // Another actor holding the key, another key, or another payload: none.
    expect(
      await replayFleetAnswer(store, 'ship', reply, 'key-1', 'owner-b')
    ).toBeNull();
    expect(
      await replayFleetAnswer(store, 'ship', reply, 'key-2', 'owner-a')
    ).toBeNull();
    expect(
      await replayFleetAnswer(
        store,
        'ship',
        { action: 'reply', text: 'Go' },
        'key-1',
        'owner-a'
      )
    ).toBeNull();
    expect(
      await replayFleetAnswer(
        store,
        'ship',
        { action: 'hold' },
        'key-1',
        'owner-a'
      )
    ).toBeNull();
    expect(
      await replayFleetAnswer(store, 'gone', reply, 'key-1', 'owner-a')
    ).toBeNull();
    // A record stored without an actor is never replayed.
    await recordFleetAnswer(store, 'legacy', { action: 'hold' }, 'key-3');
    expect(
      await replayFleetAnswer(
        store,
        'legacy',
        { action: 'hold' },
        'key-3',
        'owner-a'
      )
    ).toBeNull();
  });

  it('records, dedupes, revises and acknowledges answers', async () => {
    const store = createMemoryMastermindStore();
    const first = await recordFleetAnswer(
      store,
      'ship',
      { action: 'approve', optionId: 'yes' },
      'key-1'
    );
    expect(first).toMatchObject({ revision: 1, pickedUpRevision: 0 });
    const retry = await recordFleetAnswer(
      store,
      'ship',
      { action: 'hold' },
      'key-1'
    );
    expect(retry).toMatchObject({ revision: 1, action: 'approve' });

    expect(
      pendingFleetAnswers(await readFleetAnswers(store, ['ship']))
    ).toHaveLength(1);
    expect(
      await acknowledgeFleetAnswers(store, [
        { decisionId: 'ship', revision: 1 },
      ])
    ).toBe(1);
    expect(
      pendingFleetAnswers(await readFleetAnswers(store, ['ship']))
    ).toHaveLength(0);
    // Stale, repeated and future acks change nothing.
    expect(
      await acknowledgeFleetAnswers(store, [
        { decisionId: 'ship', revision: 1 },
        { decisionId: 'ship', revision: 9 },
        { decisionId: 'gone', revision: 1 },
      ])
    ).toBe(0);

    const second = await recordFleetAnswer(
      store,
      'ship',
      { action: 'reply', text: 'Wait for review' },
      'key-2'
    );
    expect(second).toMatchObject({ revision: 2, pickedUpRevision: 1 });
    expect(
      pendingFleetAnswers(await readFleetAnswers(store, ['ship', 'other']))
    ).toEqual([
      expect.objectContaining({ revision: 2, text: 'Wait for review' }),
    ]);
  });

  it('keeps revisions monotonic when two answers race', async () => {
    const store = createMemoryMastermindStore();
    const [a, b] = await Promise.all([
      recordFleetAnswer(store, 'race', { action: 'hold' }, 'key-a'),
      recordFleetAnswer(store, 'race', { action: 'approve' }, 'key-b'),
    ]);
    expect([a.revision, b.revision].sort()).toEqual([1, 2]);
    const latest = (await readFleetAnswers(store, ['race'])).race;
    expect(latest?.revision).toBe(2);
  });
});
