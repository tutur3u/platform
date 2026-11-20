import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { describe, expect, it } from 'vitest';
import {
  acknowledgeFleetAnswers,
  claimFleetNonce,
  pendingFleetAnswers,
  readFleetAnswers,
  readFleetState,
  recordFleetAnswer,
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

  it('claims a nonce once', async () => {
    const store = createMemoryMastermindStore();
    expect(await claimFleetNonce(store, 'sig')).toBe(true);
    expect(await claimFleetNonce(store, 'sig')).toBe(false);
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
