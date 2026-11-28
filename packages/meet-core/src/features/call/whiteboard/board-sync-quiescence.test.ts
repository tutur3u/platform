import { sanitizeGuestChanges } from '@tuturuuu/realtime/meet/board-sync-guest';
import {
  applyBoundedChanges,
  type BoardScene,
  sizesFrom,
} from '@tuturuuu/realtime/meet/board-sync-merge';
import {
  BOARD_GUEST_LIMITS,
  type BoardChange,
} from '@tuturuuu/realtime/meet/board-sync-schema';
import {
  applyRemoteElements,
  dedupeElementChanges,
  detectElementChanges,
  type ExcalidrawElement,
} from '@tuturuuu/whiteboard';
import { describe, expect, it } from 'vitest';

/**
 * Several editors share one board through the room. Each editor behaves as
 * Excalidraw 0.18 does where it matters for sync: `updateScene` repairs
 * fractional indices that do not ascend along the array in place and bumps
 * those elements' versions (`syncInvalidIndices`), and `onChange` hands the
 * editor the whole scene, which it diffs against its baseline and sends. The
 * room applies each batch as the Durable Object does (guests sanitized,
 * held to their budgets and stripped of arrow labels) and relays what it
 * applied to everyone else.
 */

type Element = ExcalidrawElement & { index: string | null };
type Actor = 'member' | 'guest';
type Mode = 'current' | 'unordered';

const copy = (elements: readonly Element[]) =>
  elements.map((element) => ({ ...element })) as Element[];

let nonce = 1;
const nextNonce = () => (nonce = (nonce * 48_271) % 2_147_483_647);

/** Excalidraw's `syncInvalidIndices`: a later element must sort after the earlier ones. */
function repairIndices(elements: Element[]) {
  let previous: string | null = null;
  for (const element of elements) {
    if (!element.index || (previous !== null && element.index <= previous)) {
      element.index = `${previous ?? 'a0'}V`;
      (element as { version: number }).version += 1;
      (element as { versionNonce: number }).versionNonce = nextNonce();
    }
    previous = element.index;
  }
}

/** A merge that keeps the local order and appends new remote elements. */
function unorderedMerge(local: readonly Element[], remote: readonly Element[]) {
  const byId = new Map(local.map((element) => [element.id, element]));
  for (const element of remote) {
    const held = byId.get(element.id);
    if (
      !held ||
      element.version > held.version ||
      (element.version === held.version &&
        element.versionNonce < held.versionNonce)
    )
      byId.set(element.id, element);
  }
  return [...byId.values()];
}

class Editor {
  scene: Element[] = [];
  baseline: Element[] = [];
  constructor(
    readonly name: string,
    readonly actor: Actor,
    private readonly mode: Mode
  ) {}

  private updateScene(elements: Element[]) {
    repairIndices(elements);
    this.scene = elements;
  }

  /** Excalidraw's `onChange`: what differs from the baseline goes out. */
  private changed() {
    const changes = detectElementChanges(this.baseline, this.scene);
    this.baseline = copy(this.scene);
    return dedupeElementChanges(changes);
  }

  receive(remote: Element[]) {
    const live = this.scene.filter((element) => !element.isDeleted);
    if (this.mode === 'current') {
      this.baseline = applyRemoteElements(
        live,
        remote,
        (elements) => this.updateScene(elements as Element[]),
        () => this.scene
      ) as Element[];
    } else {
      const merged = unorderedMerge(live, remote);
      this.baseline = copy(merged);
      this.updateScene(merged);
    }
    return this.changed();
  }

  /** Inserts drawn elements, each after `after` or at the end. */
  draw(elements: Element[], after?: string) {
    const at = after
      ? this.scene.findIndex((element) => element.id === after) + 1
      : this.scene.length;
    this.scene = [
      ...this.scene.slice(0, at),
      ...elements,
      ...this.scene.slice(at),
    ];
    return this.changed();
  }

  order() {
    return this.scene
      .filter((element) => !element.isDeleted)
      .map((element) => element.id);
  }
}

class Room {
  scene: BoardScene = new Map();
  tracker = sizesFrom(this.scene);
  queue: { to: Editor; elements: Element[] }[] = [];
  /** Element batches the room accepted from editors. */
  writes = 0;
  constructor(readonly editors: Editor[]) {}

  send(from: Editor, changes: { type: string; element: unknown }[]) {
    if (changes.length === 0) return;
    this.writes++;
    // Over the wire, as JSON.
    const wire = JSON.parse(JSON.stringify(changes)) as BoardChange[];
    const guest = from.actor === 'guest';
    const { applied } = applyBoundedChanges(
      this.scene,
      this.tracker,
      guest ? sanitizeGuestChanges(wire).changes : wire,
      undefined,
      guest
        ? {
            maxCost: BOARD_GUEST_LIMITS.maxSceneCost,
            maxArea: BOARD_GUEST_LIMITS.maxSceneCanvasPixels,
            budget: { tokens: Number.POSITIVE_INFINITY },
            stripLabels: true,
          }
        : {}
    );
    if (applied.length === 0) return;
    for (const to of this.editors)
      if (to !== from)
        this.queue.push({
          to,
          elements: JSON.parse(
            JSON.stringify(applied.map((change) => change.element))
          ),
        });
  }

  /** Delivers relays until the board is quiet or `cap` deliveries happened. */
  settle(cap: number) {
    let delivered = 0;
    while (this.queue.length > 0 && delivered < cap) {
      const { to, elements } = this.queue.shift()!;
      delivered++;
      this.send(to, to.receive(elements));
    }
    return { delivered, quiet: this.queue.length === 0 };
  }
}

const SHARED = {
  version: 1,
  versionNonce: 1,
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  angle: 0,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  seed: 1,
  groupIds: [],
  frameId: null,
  roundness: null,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
  isDeleted: false,
};
const TWO_POINTS = [
  [0, 0],
  [200, 100],
];
const TEXT = {
  text: 'Label',
  originalText: 'Label',
  fontSize: 20,
  fontFamily: 5,
  lineHeight: 1.25,
  textAlign: 'left',
  verticalAlign: 'top',
  containerId: null,
  autoResize: true,
};
const make = (id: string, type: string, index: string, over: object = {}) =>
  ({
    id,
    type,
    index,
    ...SHARED,
    ...(type === 'line' || type === 'arrow'
      ? { points: TWO_POINTS, startBinding: null, endBinding: null }
      : {}),
    ...(type === 'text' ? TEXT : {}),
    ...over,
  }) as unknown as Element;

/**
 * The live QA session: host and member, guest one draws a rectangle, a line
 * and text while guest two and the host draw at the same time (guest two's
 * text takes the same fractional index as guest one's), then guest one draws
 * an arrow and labels it; Excalidraw puts the label right after its arrow.
 */
function run(mode: Mode, cap: number) {
  const host = new Editor('host', 'member', mode);
  const member = new Editor('member', 'member', mode);
  const guest1 = new Editor('guest1', 'guest', mode);
  const guest2 = new Editor('guest2', 'guest', mode);
  const room = new Room([host, member, guest1, guest2]);

  room.send(
    guest1,
    guest1.draw([
      make('rect-1', 'rectangle', 'a0'),
      make('line-1', 'line', 'a1'),
      make('text-1', 'text', 'a2'),
    ])
  );
  room.send(guest2, guest2.draw([make('g2-text', 'text', 'a2')]));
  room.send(host, host.draw([make('host-rect', 'rectangle', 'a4')]));
  const first = room.settle(cap);

  const arrow = make('arrow-1', 'arrow', 'a3', {
    boundElements: [{ id: 'label-1', type: 'text' }],
  });
  room.send(guest1, guest1.draw([arrow], 'text-1'));
  room.send(
    guest1,
    guest1.draw(
      [make('label-1', 'text', 'a3V', { containerId: 'arrow-1' })],
      'arrow-1'
    )
  );
  const second = room.settle(cap);
  return { room, editors: [host, member, guest1, guest2], first, second };
}

describe('board sync at rest', () => {
  it('goes quiet after every editor applied the others’ drawings', () => {
    const { room, editors, first, second } = run('current', 200);

    expect(first.quiet && second.quiet).toBe(true);
    // Only the five local drawings reach the room; applying a remote batch
    // never sends anything back.
    expect(room.writes).toBe(5);
    // Each drawing is relayed once to each of the three other editors.
    expect(first.delivered + second.delivered).toBe(5 * 3);

    // Every editor holds the same elements in the same order.
    const [order, ...rest] = editors.map((editor) => editor.order());
    for (const other of rest) expect(other).toEqual(order);

    // Idle: nothing more is queued, and a redundant relay changes nothing.
    for (const editor of editors)
      expect(editor.receive(copy(editor.scene))).toEqual([]);
  });

  it('leaves every editor with the same content for every element', () => {
    const { room, editors } = run('current', 200);
    const guest1 = editors.find((editor) => editor.name === 'guest1')!;
    const held = (editor: Editor, id: string) => {
      const element = editor.scene.find((candidate) => candidate.id === id);
      expect(element, `${editor.name} holds ${id}`).toBeDefined();
      return element as Element;
    };
    /** Sorted-key JSON of an element without `omit`. */
    const content = (element: Element, omit: readonly string[] = []) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(element)
            .filter(([key]) => !omit.includes(key))
            .sort(([a], [b]) => (a < b ? -1 : 1))
        )
      );

    for (const [id, stored] of room.scene) {
      const copies = editors.map((editor) => held(editor, id));
      // The room strips a guest arrow's label binding and relays the stripped
      // arrow to the other editors only; its author keeps the binding until
      // it next edits the arrow.
      const omit =
        id === 'arrow-1' ? ['versionNonce', 'boundElements'] : ['versionNonce'];
      if (id === 'arrow-1') {
        for (const editor of editors)
          expect(held(editor, id).boundElements).toEqual(
            editor === guest1 ? [{ id: 'label-1', type: 'text' }] : []
          );
      }
      // Everything but the nonce matches on every editor: data, index and
      // version.
      for (const element of copies)
        expect(content(element, omit)).toBe(content(copies[0]!, omit));

      if (id === 'text-1') {
        // `text-1` and `g2-text` were drawn with the same index, so each editor
        // repaired `text-1` (ordered after `g2-text` by id) to `a2V` when it
        // applied them. The repair is deterministic in index and version, but
        // Excalidraw draws a random versionNonce for it, and a repair made
        // while applying a remote batch is never sent, so the nonces stay
        // per-editor until the next real edit of `text-1` supersedes them.
        expect(stored).toMatchObject({ index: 'a2', version: 1 });
        for (const element of copies)
          expect(element).toMatchObject({ index: 'a2V', version: 2 });
        expect(
          new Set(copies.map((element) => element.versionNonce)).size
        ).toBe(editors.length);
      } else {
        // Every element no editor repaired matches the room's version and
        // nonce exactly on every editor.
        for (const element of copies)
          expect(element).toMatchObject({
            index: stored.index,
            version: stored.version,
            versionNonce: stored.versionNonce,
          });
      }
    }
    // No editor holds an element the room does not.
    for (const editor of editors)
      expect(editor.scene.map((element) => element.id).sort()).toEqual(
        [...room.scene.keys()].sort()
      );
  });

  it('stores the guest arrow without its label and the label as text', () => {
    const { room } = run('current', 200);
    expect(room.scene.get('arrow-1')).toMatchObject({ boundElements: [] });
    expect(room.scene.get('label-1')).toMatchObject({
      containerId: 'arrow-1',
    });
  });

  it('re-sends without end when remote elements are appended and index repairs are sent', () => {
    // The harness's control: an apply path that appends remote elements and
    // diffs Excalidraw's index repairs as local edits never goes quiet.
    const { room, second } = run('unordered', 400);
    expect(second.quiet).toBe(false);
    expect(room.writes).toBeGreaterThan(100);
  });
});
