import { describe, expect, it } from 'vitest';
import {
  ancestors,
  keyboardMove,
  preflightMove,
  siblings,
  visibleDocuments,
  type HierarchyDocument,
} from './hierarchy';
const doc = (
  id: string,
  parent_id: string | null = null,
  position: number | null = null
): HierarchyDocument => ({
  id,
  parent_id,
  position,
  name: id,
  created_at: '2026-11-09',
});
const documents = [
  doc('a', null, 0),
  doc('b', null, 1024),
  doc('c', 'a', 0),
  doc('d', 'c', 0),
];
describe('document hierarchy', () => {
  it('sorts copied siblings with null positions last and stable ties', () => {
    const input = [doc('z'), doc('b', null, 2), doc('a', null, 2)];
    expect(siblings(input, null).map((x) => x.id)).toEqual(['a', 'b', 'z']);
    expect(input.map((x) => x.id)).toEqual(['z', 'b', 'a']);
  });
  it('projects missing parents as roots and collapses descendants', () => {
    expect(
      visibleDocuments(
        [...documents, doc('orphan', 'missing')],
        new Set(['a'])
      ).map((x) => [x.document.id, x.depth])
    ).toEqual([
      ['a', 1],
      ['c', 2],
      ['b', 1],
      ['orphan', 1],
    ]);
    expect(ancestors(documents, 'd').map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('rejects moving a subtree into itself and beyond depth 16', () => {
    expect(
      preflightMove({ documents, id: 'a', parentId: 'd', canManage: true })
    ).toEqual({ kind: 'denied', reason: 'cycle' });
    const chain = Array.from({ length: 16 }, (_, i) =>
      doc(String(i), i ? String(i - 1) : null)
    );
    expect(
      preflightMove({
        documents: [...chain, doc('other')],
        id: 'other',
        parentId: '15',
        canManage: true,
      })
    ).toEqual({ kind: 'denied', reason: 'depth' });
  });
  it('denies every keyboard operation and drag preflight without permission', () => {
    for (const direction of ['up', 'down', 'indent', 'outdent'] as const) {
      expect(
        keyboardMove({
          documents,
          id: direction === 'outdent' ? 'c' : 'b',
          direction,
          canManage: false,
        })
      ).toEqual({ kind: 'denied', reason: 'permission' });
    }
    expect(
      preflightMove({ documents, id: 'a', parentId: null, canManage: false })
    ).toEqual({ kind: 'denied', reason: 'permission' });
  });
  it('moves up, down, into the prior sibling and out of the parent', () => {
    expect(
      keyboardMove({ documents, id: 'b', direction: 'up', canManage: true })
    ).toEqual({ kind: 'allowed', move: { parent_id: null, position: -1024 } });
    expect(
      keyboardMove({ documents, id: 'a', direction: 'down', canManage: true })
    ).toEqual({ kind: 'allowed', move: { parent_id: null, position: 2048 } });
    expect(
      keyboardMove({ documents, id: 'b', direction: 'indent', canManage: true })
    ).toEqual({ kind: 'allowed', move: { parent_id: 'a', position: 1024 } });
    expect(
      keyboardMove({
        documents,
        id: 'c',
        direction: 'outdent',
        canManage: true,
      })
    ).toEqual({ kind: 'allowed', move: { parent_id: null, position: 2048 } });
  });
  it('prepares legacy null positions without changing sibling order', () => {
    const legacy = [doc('a'), doc('b'), doc('c')];
    const result = keyboardMove({
      documents: legacy,
      id: 'c',
      direction: 'up',
      canManage: true,
    });
    expect(result).toEqual({
      kind: 'allowed',
      move: { parent_id: null, position: 512 },
      preparation: [
        { id: 'a', position: 0 },
        { id: 'b', position: 1024 },
        { id: 'c', position: 2048 },
      ],
      previousPosition: 2048,
    });
    expect(legacy.every((item) => item.position === null)).toBe(true);
  });
  it('rejects a parent whose own ancestry is cyclic', () => {
    expect(
      preflightMove({
        documents: [doc('a', 'b'), doc('b', 'a'), doc('c')],
        id: 'c',
        parentId: 'a',
        canManage: true,
      })
    ).toEqual({ kind: 'denied', reason: 'cycle' });
  });
  it('restores a saved position even when append space is exhausted', () => {
    expect(
      preflightMove({
        documents: [doc('a', null, 2147483647), doc('b', 'a', 0)],
        id: 'b',
        parentId: null,
        restorePosition: 100,
        canManage: true,
      })
    ).toEqual({ kind: 'allowed', move: { parent_id: null, position: 100 } });
  });
  it('rejects exhausted integer gaps and leaves the source unchanged', () => {
    expect(
      preflightMove({
        documents: [doc('a', null, 0), doc('b', null, 1), doc('c')],
        id: 'c',
        parentId: null,
        beforeId: 'b',
        canManage: true,
      })
    ).toEqual({ kind: 'denied', reason: 'position' });
  });
});
