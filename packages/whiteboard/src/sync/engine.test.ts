import { describe, expect, it } from 'vitest';
import { makeElement } from '../testing/fixtures';
import { createElementSyncEngine } from './engine';

describe('createElementSyncEngine', () => {
  it('queues local changes and drains them as one deduplicated batch', () => {
    const engine = createElementSyncEngine();

    engine.trackLocal([], [makeElement('a')]);
    engine.trackLocal([makeElement('a')], [makeElement('a', { version: 2 })]);
    expect(engine.pendingCount).toBe(2);

    const batch = engine.drain();

    expect(batch).toHaveLength(1);
    expect(batch[0]?.element.version).toBe(2);
    expect(engine.pendingCount).toBe(0);
    expect(engine.drain()).toEqual([]);
  });

  it('generates no delta when nothing changed', () => {
    const engine = createElementSyncEngine();
    const scene = [makeElement('a'), makeElement('b')];

    expect(engine.trackLocal(scene, scene)).toBe(0);
    expect(engine.drain()).toEqual([]);
  });

  it('puts an undelivered batch back in front of newer changes', () => {
    const engine = createElementSyncEngine();

    engine.trackLocal([], [makeElement('a')]);
    const failed = engine.drain();
    engine.trackLocal([], [makeElement('b')]);
    engine.requeue(failed);

    expect(engine.drain().map((c) => c.element.id)).toEqual(['a', 'b']);
  });

  it('collapses a requeued change with a newer one for the same element', () => {
    const engine = createElementSyncEngine();

    engine.trackLocal([], [makeElement('a')]);
    const failed = engine.drain();
    engine.trackLocal([makeElement('a')], [makeElement('a', { version: 4 })]);
    engine.requeue(failed);

    const [only, ...rest] = engine.drain();
    expect(rest).toEqual([]);
    expect(only?.element.version).toBe(4);
  });

  it('applies remote batches with the shared merge rule', () => {
    const engine = createElementSyncEngine();
    const local = [makeElement('a', { version: 2, x: 1 })];

    const merged = engine.applyRemote(local, [
      makeElement('a', { version: 1, x: 9 }),
      makeElement('b'),
    ]);

    expect(merged.map((el) => [el.id, el.x])).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
  });

  it('does not echo a merged remote batch back out as a local change', () => {
    const engine = createElementSyncEngine();
    const local = [makeElement('a')];
    const merged = engine.applyRemote(local, [
      makeElement('a', { version: 2 }),
    ]);

    // The caller records the merged scene as the new baseline.
    expect(engine.trackLocal(merged, merged)).toBe(0);
  });

  it('clear drops everything pending', () => {
    const engine = createElementSyncEngine();
    engine.trackLocal([], [makeElement('a')]);
    engine.clear();

    expect(engine.pendingCount).toBe(0);
  });
});
