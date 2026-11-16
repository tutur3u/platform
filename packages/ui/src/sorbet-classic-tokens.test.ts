import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

type Mode = 'light' | 'dark';
const tokens = JSON.parse(read('packages/ui/src/sorbet-tokens.json')) as {
  color: Record<Mode, Record<string, string>>;
  classic: {
    sources: Record<string, string>;
    color: Record<Mode, Record<string, string>>;
    radius: Record<string, number>;
  };
};
const globals = read('packages/ui/src/globals.css');

function block(selector: string) {
  const start = globals.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  return globals.slice(start, globals.indexOf('\n}', start));
}

function variable(css: string, name: string) {
  const match = css.match(new RegExp(`\\n\\s*--${name}:\\s*([^;]+);`));
  expect(match, name).not.toBeNull();
  return match![1]!.trim();
}

function hslToHex(value: string) {
  const match = value.match(
    /^hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%\s*\)$/
  );
  expect(match, value).not.toBeNull();
  const [h, s, l] = match!.slice(1).map(Number) as [number, number, number];
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

// The classic table lets the mobile app and design canvas draw the default
// (non-Sorbet) theme from the same role names Sorbet uses.
describe('classic theme role table', () => {
  // Sorbet's destructive already reads as text; the classic one is a fill
  // only, so classic adds a separate destructive-ink.
  it('names every Sorbet colour role, plus destructive-ink, in both modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      expect(Object.keys(tokens.classic.color[mode]).sort()).toEqual(
        [...Object.keys(tokens.color[mode]), 'destructive-ink'].sort()
      );
    }
  });

  it('matches the classic variables in globals.css', () => {
    for (const [mode, selector] of [
      ['light', ':root'],
      ['dark', '.dark'],
    ] as const) {
      const css = block(selector);
      for (const [role, source] of Object.entries(tokens.classic.sources)) {
        expect(tokens.classic.color[mode][role], `${mode} ${role}`).toBe(
          hslToHex(variable(css, source))
        );
      }
    }
  });

  it('keeps classic destructive text at 4.5:1 on every ground', () => {
    for (const mode of ['light', 'dark'] as const) {
      const c = tokens.classic.color[mode];
      for (const ground of ['background', 'surface', 'surface-sunken']) {
        expect(
          contrast(c['destructive-ink']!, c[ground]!),
          `${mode} on ${ground}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('matches the classic dialog scrim and radius scale', () => {
    const dialog = read('packages/ui/src/components/ui/dialog.tsx');
    expect(dialog).toContain('bg-black/50');
    for (const mode of ['light', 'dark'] as const) {
      expect(tokens.classic.color[mode].scrim).toBe('rgba(0,0,0,0.5)');
    }
    const rem = Number(variable(block(':root'), 'radius').replace(/rem$/, ''));
    const lg = rem * 16;
    expect(tokens.classic.radius).toMatchObject({
      sm: lg - 4,
      md: lg - 2,
      lg,
      control: lg - 2,
      popover: lg - 2,
      sheet: lg,
    });
  });
});
