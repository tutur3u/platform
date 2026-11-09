import { describe, expect, it } from 'vitest';
import {
  clampPosition,
  cornerPosition,
  DEFAULT_PIP_PREFS,
  moveCorner,
  nearestCorner,
  nextSize,
  parsePipPrefs,
  PIP_STORAGE_KEY,
  pinchSize,
  pipDimensions,
  projectedPosition,
  readPipPrefs,
  writePipPrefs,
  dragSlop,
} from './pip-layout';

const insets = { top: 12, right: 12, bottom: 12, left: 12 };
const stage = { width: 1200, height: 700 };
const card = { width: 176, height: 99 };

describe('cornerPosition', () => {
  it('docks the card inside the insets at every corner', () => {
    expect(cornerPosition('top-left', stage, card, insets)).toEqual({
      x: 12,
      y: 12,
    });
    expect(cornerPosition('top-right', stage, card, insets)).toEqual({
      x: 1012,
      y: 12,
    });
    expect(cornerPosition('bottom-left', stage, card, insets)).toEqual({
      x: 12,
      y: 589,
    });
    expect(cornerPosition('bottom-right', stage, card, insets)).toEqual({
      x: 1012,
      y: 589,
    });
  });
  it('honours asymmetric safe-area insets', () => {
    const safe = { top: 0, right: 44, bottom: 34, left: 44 };
    expect(cornerPosition('bottom-right', stage, card, safe)).toEqual({
      x: 980,
      y: 567,
    });
  });
  it('never places the card above or left of the insets in a tiny container', () => {
    expect(
      cornerPosition('bottom-right', { width: 100, height: 50 }, card, insets)
    ).toEqual({ x: 12, y: 12 });
  });
});

describe('clampPosition', () => {
  it('keeps a dragged card fully inside the usable area', () => {
    expect(clampPosition({ x: -50, y: -50 }, stage, card, insets)).toEqual({
      x: 12,
      y: 12,
    });
    expect(clampPosition({ x: 5000, y: 5000 }, stage, card, insets)).toEqual({
      x: 1012,
      y: 589,
    });
    expect(clampPosition({ x: 300, y: 200 }, stage, card, insets)).toEqual({
      x: 300,
      y: 200,
    });
  });
});

describe('nearestCorner', () => {
  it('snaps by the quadrant holding the card centre', () => {
    expect(nearestCorner({ x: 20, y: 20 }, card, stage)).toBe('top-left');
    expect(nearestCorner({ x: 900, y: 20 }, card, stage)).toBe('top-right');
    expect(nearestCorner({ x: 20, y: 500 }, card, stage)).toBe('bottom-left');
    expect(nearestCorner({ x: 900, y: 500 }, card, stage)).toBe('bottom-right');
  });
  it('uses the centre, not the top-left edge, near the midlines', () => {
    // Top-left at 520 puts the centre at 608 > 600: right half.
    expect(nearestCorner({ x: 520, y: 20 }, card, stage)).toBe('top-right');
    expect(nearestCorner({ x: 500, y: 20 }, card, stage)).toBe('top-left');
  });
  it('lets a flick carry the card across the midline', () => {
    const released = projectedPosition({ x: 400, y: 100 }, { x: 2, y: 0 });
    expect(released.x).toBe(640);
    expect(nearestCorner(released, card, stage)).toBe('top-right');
  });
});

describe('moveCorner', () => {
  it('moves between neighbouring corners with arrow keys', () => {
    expect(moveCorner('bottom-right', 'ArrowUp')).toBe('top-right');
    expect(moveCorner('top-right', 'ArrowLeft')).toBe('top-left');
    expect(moveCorner('top-left', 'ArrowDown')).toBe('bottom-left');
    expect(moveCorner('bottom-left', 'ArrowRight')).toBe('bottom-right');
  });
  it('stays put at an edge or on another key', () => {
    expect(moveCorner('top-left', 'ArrowUp')).toBe('top-left');
    expect(moveCorner('top-left', 'ArrowLeft')).toBe('top-left');
    expect(moveCorner('top-left', 'Enter')).toBe('top-left');
  });
});

describe('sizes', () => {
  it('cycles presets on tap and steps once per pinch', () => {
    expect(nextSize('s')).toBe('m');
    expect(nextSize('m')).toBe('l');
    expect(nextSize('l')).toBe('s');
    expect(pinchSize('m', 1.4)).toBe('l');
    expect(pinchSize('l', 1.4)).toBe('l');
    expect(pinchSize('m', 0.6)).toBe('s');
    expect(pinchSize('s', 0.6)).toBe('s');
    expect(pinchSize('m', 1.1)).toBe('m');
  });
  it('keeps the preset width on wide stages and caps it on phones', () => {
    expect(pipDimensions('m', stage, insets)).toEqual({
      width: 176,
      height: 99,
    });
    expect(pipDimensions('l', stage, insets)).toEqual({
      width: 248,
      height: 140,
    });
    const phone = { width: 390, height: 620 };
    expect(pipDimensions('l', phone, insets).width).toBeLessThanOrEqual(
      Math.round(366 * 0.62)
    );
    expect(pipDimensions('s', phone, insets)).toEqual({
      width: 128,
      height: 72,
    });
  });
  it('follows a portrait camera aspect ratio', () => {
    const portrait = pipDimensions('m', stage, insets, 9 / 16);
    expect(portrait.width).toBe(176);
    expect(portrait.height).toBe(313);
  });
  it('shrinks a tall card that would not fit the stage height', () => {
    const short = { width: 1200, height: 300 };
    const dims = pipDimensions('l', short, insets, 9 / 16);
    expect(dims.height).toBeLessThanOrEqual(Math.round(276 * 0.62));
    expect(dims.width).toBe(Math.round(dims.height * (9 / 16)));
  });
});

describe('preferences', () => {
  it('rejects malformed values field by field', () => {
    expect(parsePipPrefs(null)).toEqual(DEFAULT_PIP_PREFS);
    expect(parsePipPrefs('nope')).toEqual(DEFAULT_PIP_PREFS);
    expect(
      parsePipPrefs({ corner: 'middle', size: 'xl', hidden: 'yes' })
    ).toEqual(DEFAULT_PIP_PREFS);
    expect(
      parsePipPrefs({ corner: 'top-left', size: 'l', hidden: true })
    ).toEqual({ corner: 'top-left', size: 'l', hidden: true });
  });
  it('round-trips through storage and survives storage failures', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const prefs = { corner: 'top-right', size: 's', hidden: true } as const;
    expect(writePipPrefs(storage, prefs)).toBe(true);
    expect(store.get(PIP_STORAGE_KEY)).toBe(JSON.stringify(prefs));
    expect(readPipPrefs(storage)).toEqual(prefs);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(readPipPrefs(broken)).toEqual(DEFAULT_PIP_PREFS);
    expect(writePipPrefs(broken, prefs)).toBe(false);
    expect(readPipPrefs(undefined)).toEqual(DEFAULT_PIP_PREFS);
    store.set(PIP_STORAGE_KEY, '{not json');
    expect(readPipPrefs(storage)).toEqual(DEFAULT_PIP_PREFS);
  });
});

describe('dragSlop', () => {
  it('tolerates more jitter for touch and pen than for a mouse', () => {
    expect(dragSlop('mouse')).toBe(3);
    expect(dragSlop('touch')).toBe(10);
    expect(dragSlop('pen')).toBe(10);
  });
});
