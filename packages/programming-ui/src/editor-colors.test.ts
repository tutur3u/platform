// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cssColorToHex } from './editor-colors';

/** A canvas stand-in: accepts only colors in `known`, like a real 2D context ignores invalid fills. */
function paint(known: Record<string, [number, number, number]>) {
  let fill = '#000000';
  return {
    get fillStyle() {
      return fill;
    },
    set fillStyle(value: string) {
      if (value in known || /^#0000\d\d$/.test(value)) fill = value;
    },
    clearRect() {},
    fillRect() {},
    getImageData() {
      const [red, green, blue] = known[fill] ?? [0, 0, 0];
      return { data: new Uint8ClampedArray([red, green, blue, 255]) };
    },
  } as never;
}

describe('cssColorToHex', () => {
  it('resolves any color the canvas accepts, including oklch', () => {
    const context = paint({ 'oklch(0.98 0.01 30)': [255, 251, 250] });
    expect(cssColorToHex(' oklch(0.98 0.01 30) ', context)).toBe('#fffbfa');
  });

  it('wraps bare HSL channel tokens before giving up', () => {
    const context = paint({ 'hsl(0 0% 98%)': [250, 250, 250] });
    expect(cssColorToHex('0 0% 98%', context)).toBe('#fafafa');
  });

  it('returns null for values the canvas rejects', () => {
    expect(cssColorToHex('var(--missing)', paint({}))).toBeNull();
  });
});
