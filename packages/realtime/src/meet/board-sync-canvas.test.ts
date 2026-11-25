import { describe, expect, it } from 'vitest';
import {
  elementCanvasArea,
  elementChurnCost,
  MAX_ELEMENT_CANVAS_PIXELS,
} from './board-sync-cost';
import { sanitizeGuestElement } from './board-sync-guest';
import { guestElement } from './board-sync-guest.fixtures';
import { stripArrowLabels } from './board-sync-labels';
import { applyBoundedChanges, sceneFrom, sizesFrom } from './board-sync-merge';
import {
  BOARD_GUEST_LIMITS,
  type BoardChange,
  type BoardElement,
} from './board-sync-schema';

const insert = (element: BoardElement): BoardChange => ({
  type: 'insert',
  element,
});
const areaLimit = BOARD_GUEST_LIMITS.maxSceneCanvasPixels;

describe('canvas area', () => {
  it('measures the box at a pixel ratio of three plus its padding', () => {
    // (200·3 + 40) × (100·3 + 40)
    expect(elementCanvasArea(guestElement('rectangle'))).toBe(640 * 340);
    const line = guestElement('line', {
      width: 0,
      height: 0,
      points: [
        [0, 0],
        [300, -50],
        [100, 40],
      ],
    });
    expect(elementCanvasArea(line)).toBe(940 * 310);
    const huge = guestElement('rectangle', { width: 1e4, height: 1e4 });
    expect(elementCanvasArea(huge)).toBe(MAX_ELEMENT_CANVAS_PIXELS);
    expect(elementCanvasArea({ ...huge, isDeleted: true })).toBe(0);
    expect(elementCanvasArea({ type: 'text' })).toBe(MAX_ELEMENT_CANVAS_PIXELS);
  });

  it('pads text by half its font size and freehand by twelve strokes', () => {
    const empty = guestElement('text', { width: 0, height: 0, fontSize: 256 });
    expect(elementCanvasArea(empty)).toBe(256 * 256);
    const stroke = (strokeWidth: number) =>
      guestElement('freedraw', {
        strokeWidth,
        points: [
          [0, 0],
          [300, 200],
        ],
      });
    expect(elementCanvasArea(stroke(2))).toBe((900 + 48) * (600 + 48));
    expect(elementCanvasArea(stroke(16))).toBe((900 + 384) * (600 + 384));
  });

  it('charges zero-size shapes and one-point strokes their padding', () => {
    // Nothing to draw, but every viewer still allocates the padding.
    const empty = guestElement('rectangle', { width: 0, height: 0 });
    expect(elementCanvasArea(empty)).toBe(40 * 40);
    expect(elementChurnCost(empty)).toBe(1 + 1);
    const dot = guestElement('freedraw', {
      strokeWidth: 16,
      width: 0,
      height: 0,
      points: [[0, 0]],
    });
    expect(elementCanvasArea(dot)).toBe(384 * 384);
    expect(sanitizeGuestElement(dot)).not.toBeNull();
  });

  it('refuses the padding exploits for guests', () => {
    expect(
      sanitizeGuestElement(guestElement('text', { fontSize: 257 }))
    ).toBeNull();
    expect(
      sanitizeGuestElement(guestElement('freedraw', { strokeWidth: 17 }))
    ).toBeNull();
    expect(
      sanitizeGuestElement(guestElement('rectangle', { strokeWidth: 64 }))
    ).not.toBeNull();
  });

  it('adds the uncapped label canvas of a labelled arrow', () => {
    const arrow = (boundElements: unknown) =>
      guestElement('arrow', {
        boundElements,
        points: [
          [0, 0],
          [16_000, 0],
        ],
      });
    expect(elementCanvasArea(arrow(null))).toBe(48_040 * 40);
    // A square of the longest side plus ten paddings: about a gigapixel.
    expect(elementCanvasArea(arrow([{ id: 't', type: 'text' }]))).toBe(
      48_040 * 40 + 48_200 * 48_200
    );
  });

  it('grows a rounded line or arrow for its curve and roughness', () => {
    // A zig-zag through a 1,000 px box draws 1,250 by 1,199 as a curve, and
    // 1,269 by 1,212 at roughness 5.
    const zigzag = (roughness: number, roundness: unknown) =>
      guestElement('line', {
        roughness,
        roundness,
        points: [
          [0, 0],
          [1000, 0],
          [1000, 1000],
          [0, 1000],
          [0, 0],
          [1000, 0],
        ],
      });
    const round = { type: 2 };
    // (1,250·3 + 40)², and (1,270·3 + 40)² with four units per roughness.
    expect(elementCanvasArea(zigzag(0, round))).toBe(3790 * 3790);
    expect(elementCanvasArea(zigzag(5, round))).toBe(3850 * 3850);
    // Straight segments stay within their points.
    expect(elementCanvasArea(zigzag(5, null))).toBe(3040 * 3040);
    // A rounded arrow's label canvas grows with it.
    const arrow = guestElement('arrow', {
      roughness: 0,
      roundness: round,
      boundElements: [{ id: 't', type: 'text' }],
      points: [
        [0, 0],
        [16_000, 0],
      ],
    });
    expect(elementCanvasArea(arrow)).toBe(60_040 * 40 + 60_200 * 60_200);
  });

  // Each costs one to draw, but every viewer caches it on a full-size canvas.
  const large = (id: string, over: Record<string, unknown> = {}) =>
    guestElement('rectangle', { id, width: 2048, height: 2048, ...over });

  it('refuses a guest flood of large shapes past the scene area', () => {
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    const flood = Array.from({ length: 2000 }, (_, i) =>
      insert(large(`g${i}`))
    );
    const { applied, rejected } = applyBoundedChanges(
      scene,
      tracker,
      flood,
      undefined,
      { maxArea: areaLimit }
    );
    expect(rejected).toBe('size');
    expect(applied).toHaveLength(4);
    expect(tracker.areaTotal).toBe(areaLimit);
    expect(tracker.costTotal).toBe(4);
  });

  it('counts members and frees the area on shrink and delete', () => {
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    const members = Array.from({ length: 4 }, (_, i) => insert(large(`m${i}`)));
    applyBoundedChanges(scene, tracker, members);
    const guest = (element: BoardElement) =>
      applyBoundedChanges(scene, tracker, [insert(element)], undefined, {
        maxArea: areaLimit,
      });
    expect(guest(large('g1')).rejected).toBe('size');
    expect(
      guest(large('m0', { version: 2, width: 10, height: 10 })).applied
    ).toHaveLength(1);
    expect(guest(large('g1')).rejected).toBe('size');
    guest(large('m1', { version: 2, isDeleted: true }));
    expect(guest(large('g1')).applied).toHaveLength(1);
    expect(sizesFrom(scene).areaTotal).toBe(tracker.areaTotal);
  });

  it('charges the canvas to churn, cutting off a re-sent large shape', () => {
    // One to draw and 4,096 for the full-size canvas each viewer redraws.
    expect(elementChurnCost(large('a'))).toBe(1 + 4096);
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    const budget = { tokens: BOARD_GUEST_LIMITS.churnCapacity };
    const resend = Array.from({ length: 30 }, (_, i) =>
      insert(large('a', { version: i + 1 }))
    );
    const { applied, rejected } = applyBoundedChanges(
      scene,
      tracker,
      resend,
      undefined,
      { maxArea: areaLimit, budget }
    );
    expect(applied).toHaveLength(9);
    expect(rejected).toBe('size');
  });
});

describe('arrow labels', () => {
  const labelsOf = (change: BoardChange) =>
    (
      change.element as unknown as { boundElements: { id: string }[] }
    ).boundElements.map((bound) => bound.id);

  it('drops every text label from arrows, backed or not', () => {
    const arrow = guestElement('arrow', {
      id: 'a',
      boundElements: [
        { id: 'r', type: 'arrow' },
        { id: 'a', type: 'text' },
        { id: 'label', type: 'text' },
      ],
    });
    // A rectangle's own text is not an arrow label: Excalidraw caps it.
    const box = guestElement('rectangle', {
      id: 'b',
      boundElements: [{ id: 'inside', type: 'text' }],
    });
    const [stripped, label, kept] = stripArrowLabels([
      insert(arrow),
      insert(guestElement('text', { id: 'label', containerId: 'a' })),
      insert(box),
    ]);
    expect(labelsOf(stripped!)).toEqual(['r']);
    expect(label!.element.id).toBe('label');
    expect(kept!.element).toBe(box);
  });

  const long = guestElement('arrow', {
    id: 'a',
    boundElements: [{ id: 'a', type: 'text' }],
    points: [
      [0, 0],
      [16_000, 0],
    ],
  });

  it('stores and relays a guest arrow without its label', () => {
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    const { applied } = applyBoundedChanges(
      scene,
      tracker,
      [insert(long)],
      undefined,
      { maxArea: areaLimit, stripLabels: true }
    );
    expect(labelsOf(applied[0]!)).toEqual([]);
    expect(scene.get('a')).toEqual(applied[0]!.element);
    expect(tracker.areaTotal).toBe(48_040 * 40);
  });

  it('keeps and charges a member arrow label', () => {
    const scene = sceneFrom([]);
    const tracker = sizesFrom(scene);
    const { applied } = applyBoundedChanges(scene, tracker, [insert(long)]);
    expect(labelsOf(applied[0]!)).toEqual(['a']);
    expect(tracker.areaTotal).toBe(48_040 * 40 + 48_200 * 48_200);
  });
});
