import { describe, expect, it } from 'vitest';
import { estimatedFillLines } from './board-sync-fill';
import { sanitizeGuestElement } from './board-sync-guest';
import { MAX_GUEST_FILL_LINES } from './board-sync-guest-element';
import { applyBoundedChanges, sceneFrom, sizesFrom } from './board-sync-merge';
import {
  BOARD_GUEST_LIMITS,
  type BoardChange,
  type BoardElement,
} from './board-sync-schema';

const shape = (id: string, over: object = {}) =>
  ({
    id,
    type: 'rectangle',
    version: 1,
    versionNonce: 1,
    x: 0,
    y: 0,
    width: 6000,
    height: 6000,
    strokeWidth: 0.5,
    fillStyle: 'hachure',
    backgroundColor: '#ffc9c9',
    ...over,
  }) as unknown as BoardElement;
const insert = (element: BoardElement): BoardChange => ({
  type: 'insert',
  element,
});
const guestLimit = BOARD_GUEST_LIMITS.maxSceneFillLines;

describe('estimatedFillLines', () => {
  it('fills a line or freehand shape from its points, not its size', () => {
    const line = shape('l', {
      type: 'line',
      width: 0,
      height: 0,
      fillStyle: 'cross-hatch',
      points: [
        [0, 0],
        [1e5, 0],
        [1e5, 1e5],
        [0, 1e5],
        [0, 0],
      ],
    });
    expect(estimatedFillLines(line)).toBeGreaterThan(100_000);
    expect(sanitizeGuestElement(line)).toBeNull();
    const freedraw = shape('f', {
      type: 'freedraw',
      width: 0,
      height: 0,
      points: [
        [0, 0],
        [40_000, 40_000],
      ],
    });
    expect(sanitizeGuestElement(freedraw)).toBeNull();
  });

  it('counts a missing fill style as hachure', () => {
    const rest = { ...shape('m') } as Record<string, unknown>;
    delete rest.fillStyle;
    expect(estimatedFillLines(rest)).toBe(
      estimatedFillLines(shape('h', { fillStyle: 'hachure' }))
    );
    expect(
      sanitizeGuestElement({ ...rest, width: 1e5 } as BoardElement)
    ).toBeNull();
  });

  it('counts zigzag and cross-hatch as two lines per hachure line', () => {
    const hachure = estimatedFillLines(shape('a'));
    expect(estimatedFillLines(shape('z', { fillStyle: 'zigzag' }))).toBe(
      hachure * 2
    );
    expect(
      estimatedFillLines(shape('c', { fillStyle: 'cross-hatch' }))
    ).toBe(hachure * 2);
    expect(estimatedFillLines(shape('s', { fillStyle: 'solid' }))).toBe(0);
  });

  it('draws no fill on a transparent background or a deleted element', () => {
    expect(
      estimatedFillLines(shape('t', { backgroundColor: 'transparent' }))
    ).toBe(0);
    expect(estimatedFillLines(shape('d', { isDeleted: true }))).toBe(0);
  });

  it('refuses one guest element above ten thousand fill lines', () => {
    // 6000 x 6000 at stroke width 0.5 is about 4,243 lines.
    expect(sanitizeGuestElement(shape('ok'))).not.toBeNull();
    const zigzag = shape('zz', {
      width: 1e4,
      height: 1e4,
      fillStyle: 'zigzag',
    });
    expect(estimatedFillLines(zigzag)).toBeGreaterThan(MAX_GUEST_FILL_LINES);
    expect(sanitizeGuestElement(zigzag)).toBeNull();
  });
});

describe('scene fill budget', () => {
  it('refuses a guest flood of fills past the scene budget', () => {
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    const flood = Array.from({ length: 2000 }, (_, i) =>
      insert(shape(`g${i}`))
    );
    const { applied, rejected } = applyBoundedChanges(
      scene,
      tracker,
      flood,
      undefined,
      guestLimit
    );
    expect(rejected).toBe('size');
    expect(applied.length).toBeLessThan(50);
    expect(tracker.fillTotal).toBeLessThanOrEqual(guestLimit);
  });

  it('counts members and keeps the total across updates and deletes', () => {
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    // Members are never refused, and their fills count toward the total.
    const members = Array.from({ length: 47 }, (_, i) =>
      insert(shape(`m${i}`))
    );
    expect(applyBoundedChanges(scene, tracker, members).applied).toHaveLength(
      47
    );
    const guest = (element: BoardElement) =>
      applyBoundedChanges(
        scene,
        tracker,
        [insert(element)],
        undefined,
        guestLimit
      );
    expect(guest(shape('g1')).rejected).toBe('size');
    // A guest may always shrink or keep an element's fill.
    expect(
      guest(shape('m0', { version: 2, width: 10, height: 10 })).applied
    ).toHaveLength(1);
    const afterShrink = tracker.fillTotal;
    expect(guest(shape('g1')).applied).toHaveLength(1);
    expect(tracker.fillTotal).toBeGreaterThan(afterShrink);
    // Deleting frees the element's share of the budget.
    const before = tracker.fillTotal;
    guest(shape('m1', { version: 2, isDeleted: true }));
    expect(tracker.fillTotal).toBeLessThan(before);
    // A rebuilt tracker agrees with the running one.
    expect(sizesFrom(scene).fillTotal).toBeCloseTo(tracker.fillTotal);
  });
});
