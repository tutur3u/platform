import { describe, expect, it } from 'vitest';
import {
  clampRenderCost,
  elementRenderCost,
  MAX_RENDER_COST,
} from './board-sync-cost';
import {
  refillChurnBudget,
  refillRoomChurnBudget,
  sanitizeGuestChanges,
  sanitizeGuestElement,
} from './board-sync-guest';
import { guestElement } from './board-sync-guest.fixtures';
import { applyBoundedChanges, sceneFrom, sizesFrom } from './board-sync-merge';
import {
  BOARD_GUEST_LIMITS,
  BOARD_LIMITS,
  type BoardChange,
  type BoardElement,
  boardElementSchema,
  byteLength,
} from './board-sync-schema';

const filled = { fillStyle: 'hachure', backgroundColor: '#ffc9c9' };
const insert = (element: BoardElement): BoardChange => ({
  type: 'insert',
  element,
});

/** The bench comb: a closed line whose teeth each cross every scan line. */
function comb(teeth: number, length: number, spacing: number) {
  const points: [number, number][] = [[0, 0]];
  for (let i = 0; i < teeth; i++) {
    const x = i * spacing;
    points.push([x, length], [x + 1, length], [x + 1, 0.5]);
  }
  points.push([teeth * spacing, 0], [0, 0]);
  return points;
}

describe('elementRenderCost fills', () => {
  it('bounds a concave closed line by its edges, not its box', () => {
    const element = guestElement('line', {
      ...filled,
      strokeWidth: 0.5,
      points: comb(1250, 2000, 4),
    });
    // hachure-fill emits 821,755 segments for this shape.
    expect(elementRenderCost(element)).toBeGreaterThan(821_755);
    expect(sanitizeGuestElement(element)).toBeNull();
  });

  it('scans the whole outline of a concave shape, not its span', () => {
    // hachure-fill touches every active edge on each scan step, so a comb
    // whose span is small still scans the length of all its teeth.
    const element = guestElement('line', {
      ...filled,
      roughness: 0,
      strokeWidth: 64,
      points: comb(200, 500, 2),
    });
    expect(elementRenderCost(element)).toBe(13_996);
    expect(sanitizeGuestElement(element)).toBeNull();
    const short = { ...element, points: comb(200, 200, 2) };
    expect(elementRenderCost(short)).toBe(6203);
    expect(sanitizeGuestElement(short)).not.toBeNull();
  });

  it('traces each point of a solid fill on a line', () => {
    const points = Array.from({ length: 4000 }, (_, i) => [i * 3, i % 2]);
    const line = guestElement('line', {
      backgroundColor: '#ffc9c9',
      fillStyle: 'solid',
      roughness: 0,
      points,
    });
    // One, 4,000 stroke segments and 5,000 for the fill with its curves.
    expect(elementRenderCost(line)).toBe(9001);
  });

  it('accepts a normal filled freehand loop', () => {
    const points = Array.from({ length: 60 }, (_, i) => {
      const angle = (i / 59) * 2 * Math.PI;
      return [100 * Math.cos(angle), 100 * Math.sin(angle)];
    });
    const loop = guestElement('freedraw', { ...filled, points });
    expect(elementRenderCost(loop)).toBeLessThan(200);
    expect(sanitizeGuestElement(loop)).not.toBeNull();
  });

  it('counts the scan across the shape, not only the lines', () => {
    // A wide gap draws few lines, but hachure-fill still scans every unit.
    const wide = guestElement('rectangle', {
      ...filled,
      strokeWidth: 64,
      width: 1e5,
      height: 1e5,
    });
    const diagonal = Math.hypot(1e5, 1e5);
    const lines = diagonal / 256;
    expect(elementRenderCost(wide)).toBeGreaterThan(lines + diagonal / 16);
  });

  it('counts zigzag and cross-hatch twice, and cross-hatch scans twice', () => {
    // A 1,600 diagonal at a gap of 10: 161 lines and 100 scan units.
    const box = (fillStyle: string) =>
      elementRenderCost(
        guestElement('rectangle', {
          ...filled,
          fillStyle,
          width: 960,
          height: 1280,
          strokeWidth: 2.5,
        })
      );
    expect(box('hachure')).toBe(1 + 161 + 100);
    expect(box('zigzag')).toBe(1 + 2 * 161 + 100);
    expect(box('cross-hatch')).toBe(1 + 2 * 161 + 2 * 100);
    expect(box('solid')).toBe(1);
  });

  it('counts a missing fill style as hachure', () => {
    const hachure = guestElement('rectangle', filled);
    const missing: Record<string, unknown> = { ...hachure };
    delete missing.fillStyle;
    expect(elementRenderCost(missing)).toBe(elementRenderCost(hachure));
  });

  it('draws no fill for arrows, text, transparent or deleted shapes', () => {
    // Two points, each stroked twice for roughness: no fill.
    const arrow = guestElement('arrow', filled);
    expect(elementRenderCost(arrow)).toBe(1 + 2 * 2);
    expect(
      elementRenderCost(guestElement('rectangle', { fillStyle: 'hachure' }))
    ).toBe(1);
    const deleted = guestElement('rectangle', { ...filled, isDeleted: true });
    expect(elementRenderCost(deleted)).toBe(0);
  });
});

describe('elementRenderCost strokes and text', () => {
  it('counts the dots and dashes along the outline', () => {
    const square = (strokeStyle: string, side: number) =>
      guestElement('rectangle', { strokeStyle, width: side, height: side });
    // 400,000 units of outline at one dot per 7.5 units.
    expect(elementRenderCost(square('dotted', 1e5))).toBeGreaterThan(53_000);
    expect(sanitizeGuestElement(square('dotted', 1e5))).toBeNull();
    expect(sanitizeGuestElement(square('dashed', 500))).not.toBeNull();
    const line = guestElement('line', {
      strokeStyle: 'dashed',
      points: [
        [0, 0],
        [16_000, 0],
      ],
    });
    // Two points stroked once (dashes never double), and 16,000 units of
    // curve, 1.7 times longer, at one dash per 16.
    expect(elementRenderCost(line)).toBe(1 + 2 + 1700);
  });

  it('counts each point of a stroke, twice for a rough line or arrow', () => {
    const points = Array.from({ length: 5000 }, (_, i) => [i * 3, i % 2]);
    const line = (roughness: number) =>
      guestElement('line', { roughness, points });
    expect(elementRenderCost(line(0))).toBe(1 + 5000);
    expect(elementRenderCost(line(1))).toBe(1 + 2 * 5000);
    expect(sanitizeGuestElement(line(0))).not.toBeNull();
    expect(sanitizeGuestElement(line(1))).toBeNull();
    // A rough solid arrow hits the same 10,000 render-cost ceiling at 5,000 points.
    const arrowPoints = Array.from({ length: 5000 }, () => [0, 0]);
    const roughArrow = guestElement('arrow', {
      id: 'rough-arrow',
      roughness: 1,
      strokeStyle: 'solid',
      points: arrowPoints,
    });
    const maxRoughArrow = guestElement('arrow', {
      id: 'max-rough-arrow',
      roughness: 1,
      strokeStyle: 'solid',
      points: arrowPoints.slice(0, 4999),
    });
    const smoothArrow = guestElement('arrow', {
      id: 'smooth-arrow',
      roughness: 0,
      strokeStyle: 'solid',
      points: arrowPoints,
    });
    expect(elementRenderCost(maxRoughArrow)).toBe(1 + 2 * 4999);
    expect(sanitizeGuestElement(maxRoughArrow)).not.toBeNull();
    expect(elementRenderCost(roughArrow)).toBe(1 + 2 * 5000);
    expect(sanitizeGuestElement(roughArrow)).toBeNull();
    expect(sanitizeGuestChanges([insert(roughArrow)])).toEqual({
      changes: [],
      dropped: 1,
    });
    expect(elementRenderCost(smoothArrow)).toBe(1 + 5000);
    expect(sanitizeGuestElement(smoothArrow)).not.toBeNull();
    // Members are not held to the guest element render-cost limit.
    expect(byteLength(roughArrow)).toBeLessThanOrEqual(
      BOARD_LIMITS.maxElementBytes
    );
    expect(boardElementSchema.safeParse(roughArrow).success).toBe(true);
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    const memberWrite = applyBoundedChanges(scene, tracker, [
      insert(roughArrow),
    ]);
    expect(memberWrite.rejected).toBeNull();
    expect(memberWrite.applied).toHaveLength(1);
    expect(scene.get('rough-arrow')).toEqual(roughArrow);
    // A freehand stroke is one outline path, rough or not.
    const free = guestElement('freedraw', { roughness: 1, points });
    expect(elementRenderCost(free)).toBe(1 + 5000);
    expect(sanitizeGuestElement(free)).not.toBeNull();
  });

  it('counts one per line of text', () => {
    const text = guestElement('text', { text: 'a\nb\nc' });
    expect(elementRenderCost(text)).toBe(1 + 3);
  });

  it('stays a finite integer for extreme values', () => {
    const extreme = {
      type: 'rectangle',
      ...filled,
      width: 1e308,
      height: 1e308,
      strokeWidth: 1e-300,
    };
    expect(elementRenderCost(extreme)).toBe(MAX_RENDER_COST);
    expect(clampRenderCost(Number.NaN)).toBe(MAX_RENDER_COST);
    expect(clampRenderCost(Number.POSITIVE_INFINITY)).toBe(MAX_RENDER_COST);
    expect(clampRenderCost(2.2)).toBe(3);
  });
});

// About 4,775 each: 4,244 fill lines and 531 scan units.
const heavy = (id: string, over: Record<string, unknown> = {}) =>
  guestElement('rectangle', {
    id,
    ...filled,
    width: 6000,
    height: 6000,
    strokeWidth: 0.5,
    ...over,
  });
const sceneLimit = BOARD_GUEST_LIMITS.maxSceneCost;

describe('scene render budget', () => {
  it('refuses a guest flood past the scene budget', () => {
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    const flood = Array.from({ length: 2000 }, (_, i) =>
      insert(heavy(`g${i}`))
    );
    const { applied, rejected } = applyBoundedChanges(
      scene,
      tracker,
      flood,
      undefined,
      { maxCost: sceneLimit }
    );
    expect(rejected).toBe('size');
    expect(applied.length).toBeLessThan(45);
    expect(tracker.costTotal).toBeLessThanOrEqual(sceneLimit);
  });

  it('counts members and keeps the total across updates and deletes', () => {
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    const members = Array.from({ length: 41 }, (_, i) =>
      insert(heavy(`m${i}`))
    );
    expect(applyBoundedChanges(scene, tracker, members).applied).toHaveLength(
      41
    );
    const guest = (element: BoardElement) =>
      applyBoundedChanges(scene, tracker, [insert(element)], undefined, {
        maxCost: sceneLimit,
      });
    expect(guest(heavy('g1')).rejected).toBe('size');
    // A guest may always shrink or keep an element's cost.
    expect(
      guest(heavy('m0', { version: 2, width: 10, height: 10 })).applied
    ).toHaveLength(1);
    expect(guest(heavy('g1')).applied).toHaveLength(1);
    // Deleting frees the element's share of the budget.
    const before = tracker.costTotal;
    guest(heavy('m1', { version: 2, isDeleted: true }));
    expect(tracker.costTotal).toBeLessThan(before);
    // A rebuilt tracker agrees with the running one.
    expect(sizesFrom(scene).costTotal).toBe(tracker.costTotal);
  });

  it('fails closed once a member element reaches the maximum cost', () => {
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    const extreme = {
      ...heavy('m'),
      width: 1e308,
      height: 1e308,
    } as BoardElement;
    applyBoundedChanges(scene, tracker, [insert(extreme)]);
    expect(tracker.costTotal).toBe(MAX_RENDER_COST);
    const small = guestElement('rectangle', { id: 'g' });
    const limits = { maxCost: sceneLimit };
    expect(
      applyBoundedChanges(scene, tracker, [insert(small)], undefined, limits)
        .rejected
    ).toBe('size');
    tracker.costTotal = Number.NaN;
    expect(
      applyBoundedChanges(scene, tracker, [insert(small)], undefined, limits)
        .rejected
    ).toBe('size');
  });
});

describe('churn budget', () => {
  it('charges every applied change, re-sent copies included', () => {
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    // Each copy costs 4,775 to draw and 4,096 for its full-size canvas.
    const budget = { tokens: 20_000 };
    const send = (element: BoardElement) =>
      applyBoundedChanges(scene, tracker, [insert(element)], undefined, {
        maxCost: sceneLimit,
        budget,
      });
    expect(send(heavy('a', { version: 1 })).applied).toHaveLength(1);
    expect(send(heavy('a', { version: 2 })).applied).toHaveLength(1);
    // The same shape again, same cost: the bucket is spent.
    const third = send(heavy('a', { version: 3 }));
    expect(third.applied).toHaveLength(0);
    expect(third.rejected).toBe('size');
    // Deleting costs nothing, so cleanup still applies.
    expect(
      send(heavy('a', { version: 4, isDeleted: true })).applied
    ).toHaveLength(1);
  });

  it('refills a connection bucket over time up to its capacity', () => {
    const { churnCapacity, churnRefillPerSecond } = BOARD_GUEST_LIMITS;
    expect(refillChurnBudget({}, 0)).toBe(churnCapacity);
    expect(refillChurnBudget({ tokens: 0, tokensAt: 0 }, 1000)).toBe(
      churnRefillPerSecond
    );
    expect(refillChurnBudget({ tokens: 0, tokensAt: 0 }, 3_600_000)).toBe(
      churnCapacity
    );
  });

  it('shares a room bucket of three connections, full in ten seconds', () => {
    const { churnCapacity, roomChurnCapacity, roomChurnRefillPerSecond } =
      BOARD_GUEST_LIMITS;
    expect(roomChurnCapacity).toBe(3 * churnCapacity);
    expect(refillRoomChurnBudget({}, 0)).toBe(roomChurnCapacity);
    expect(refillRoomChurnBudget({ tokens: 0, tokensAt: 0 }, 1000)).toBe(
      roomChurnRefillPerSecond
    );
    expect(refillRoomChurnBudget({ tokens: 0, tokensAt: 0 }, 10_000)).toBe(
      roomChurnCapacity
    );
  });
});
