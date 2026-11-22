import { describe, expect, it } from 'vitest';
import { makeElement } from '../testing/fixtures';
import {
  dedupeElementChanges,
  detectElementChanges,
  mergeElements,
} from './elements';

describe('detectElementChanges', () => {
  it('reports inserts, version or nonce updates and ignores untouched elements', () => {
    const previous = [makeElement('same'), makeElement('bumped')];
    const current = [
      makeElement('same'),
      makeElement('bumped', { version: 2 }),
      makeElement('fresh'),
    ];

    expect(
      detectElementChanges(previous, current).map((c) => [c.element.id, c.type])
    ).toEqual([
      ['bumped', 'update'],
      ['fresh', 'insert'],
    ]);
  });

  it('treats a nonce-only change as an update', () => {
    const changes = detectElementChanges(
      [makeElement('a')],
      [makeElement('a', { versionNonce: 9 })]
    );

    expect(changes).toEqual([
      { element: expect.objectContaining({ id: 'a' }), type: 'update' },
    ]);
  });

  it('reports a removed element as a deleted copy of the old one', () => {
    const [change] = detectElementChanges([makeElement('gone')], []);

    expect(change?.type).toBe('delete');
    expect(change?.element.id).toBe('gone');
    expect(change?.element.isDeleted).toBe(true);
  });

  it('reports a soft delete once, not as an update plus a delete twice', () => {
    const changes = detectElementChanges(
      [makeElement('a')],
      [makeElement('a', { isDeleted: true, version: 2 })]
    );

    expect(changes.map((c) => c.type)).toEqual(['update', 'delete']);
  });

  it('does not re-report an element that was already deleted', () => {
    const deleted = makeElement('a', { isDeleted: true, version: 2 });

    expect(detectElementChanges([deleted], [deleted])).toEqual([]);
  });
});

describe('mergeElements', () => {
  it('adds elements the local scene does not have', () => {
    const merged = mergeElements([makeElement('a')], [makeElement('b')]);

    expect(merged.map((el) => el.id)).toEqual(['a', 'b']);
  });

  it('takes the remote element only when its version is higher', () => {
    const local = makeElement('a', { version: 3, x: 1 });

    expect(
      mergeElements([local], [makeElement('a', { version: 4, x: 2 })])[0]
    ).toMatchObject({ version: 4, x: 2 });
    expect(
      mergeElements([local], [makeElement('a', { version: 2, x: 2 })])[0]
    ).toMatchObject({ version: 3, x: 1 });
  });

  it('breaks a version tie with the lower versionNonce', () => {
    const local = makeElement('a', { version: 2, versionNonce: 50, x: 1 });

    expect(
      mergeElements(
        [local],
        [makeElement('a', { version: 2, versionNonce: 10, x: 2 })]
      )[0]
    ).toMatchObject({ versionNonce: 10, x: 2 });
    expect(
      mergeElements(
        [local],
        [makeElement('a', { version: 2, versionNonce: 90, x: 2 })]
      )[0]
    ).toMatchObject({ versionNonce: 50, x: 1 });
  });

  it('keeps the local element on an exact version and nonce tie', () => {
    const local = makeElement('a', { version: 2, versionNonce: 5, x: 1 });

    expect(
      mergeElements(
        [local],
        [makeElement('a', { version: 2, versionNonce: 5, x: 2 })]
      )[0]?.x
    ).toBe(1);
  });

  it('lets a newer deletion win and an older one lose', () => {
    const local = makeElement('a', { version: 2 });

    expect(
      mergeElements(
        [local],
        [makeElement('a', { version: 3, isDeleted: true })]
      )[0]?.isDeleted
    ).toBe(true);
    expect(
      mergeElements(
        [makeElement('a', { version: 5 })],
        [makeElement('a', { version: 3, isDeleted: true })]
      )[0]?.isDeleted
    ).toBe(false);
  });

  it('is idempotent when the same remote batch is applied twice', () => {
    const local = [makeElement('a', { version: 1 }), makeElement('b')];
    const remote = [
      makeElement('a', { version: 2, x: 7 }),
      makeElement('c', { version: 1 }),
    ];

    const once = mergeElements(local, remote);
    const twice = mergeElements(once, remote);

    expect(twice).toEqual(once);
  });

  it('converges whichever order two peers receive each other updates in', () => {
    const base = [makeElement('a')];
    const fromX = makeElement('a', { version: 2, versionNonce: 20, x: 1 });
    const fromY = makeElement('a', { version: 2, versionNonce: 30, x: 2 });

    const peerX = mergeElements([fromX], [fromY]);
    const peerY = mergeElements([fromY], [fromX]);

    expect(peerX).toEqual(peerY);
    expect(mergeElements(base, [fromX, fromY])).toEqual(peerX);
  });

  it('does not mutate its inputs', () => {
    const local = Object.freeze([makeElement('a')]);
    const remote = Object.freeze([makeElement('a', { version: 2 })]);

    expect(() => mergeElements(local, remote)).not.toThrow();
    expect(local[0]?.version).toBe(1);
  });
});

describe('dedupeElementChanges', () => {
  it('keeps only the newest change per element', () => {
    const changes = dedupeElementChanges([
      { element: makeElement('a', { version: 1 }), type: 'insert' },
      { element: makeElement('a', { version: 3 }), type: 'update' },
      { element: makeElement('a', { version: 2 }), type: 'update' },
      { element: makeElement('b'), type: 'insert' },
    ]);

    expect(changes.map((c) => [c.element.id, c.element.version])).toEqual([
      ['a', 3],
      ['b', 1],
    ]);
  });

  it('prefers the higher versionNonce on equal versions', () => {
    const [kept] = dedupeElementChanges([
      {
        element: makeElement('a', { version: 2, versionNonce: 5 }),
        type: 'update',
      },
      {
        element: makeElement('a', { version: 2, versionNonce: 8 }),
        type: 'update',
      },
      {
        element: makeElement('a', { version: 2, versionNonce: 6 }),
        type: 'update',
      },
    ]);

    expect(kept?.element.versionNonce).toBe(8);
  });
});
