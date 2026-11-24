import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

const read = (path: string) =>
  readFileSync(resolve(repoRoot, 'packages/ui/src', path), 'utf8');

type Mode = 'light' | 'dark';
type WebHue = Record<Mode, string> & { highContrast: Record<Mode, string> };

const tokens = JSON.parse(read('sorbet-tokens.json')) as {
  color: Record<Mode, Record<string, string>>;
  hues: Record<string, unknown>;
  webHues: Record<string, WebHue | string>;
  presets: {
    palettes: Record<string, Record<Mode, Record<string, unknown>>>;
  };
};

const webHues = Object.fromEntries(
  Object.entries(tokens.webHues).filter(
    (entry): entry is [string, WebHue] => typeof entry[1] === 'object'
  )
);

/** Custom properties declared by the first rule that starts with `selector`. */
function declarations(css: string, selector: string) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Missing rule for ${selector}`);
  const open = css.indexOf('{', start);
  const body = css.slice(open + 1, css.indexOf('\n}', open));
  const found: Record<string, string> = {};
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    found[match[1]!] = match[2]!.trim();
  }
  return found;
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

const sorbet = read('sorbet.css');
const presets = read('sorbet-presets.css');
const blocks = {
  light: declarations(sorbet, ':root[data-ui="sorbet"] {'),
  dark: declarations(sorbet, ':root[data-ui="sorbet"].dark {'),
  highContrastLight: declarations(
    presets,
    ':root[data-ui="sorbet"][data-sorbet-preset="high-contrast"],'
  ),
  highContrastDark: declarations(
    presets,
    ':root[data-ui="sorbet"][data-sorbet-preset="high-contrast"].dark,'
  ),
};

// Every dynamic hue globals.css exposes as a --color-dynamic-<hue> utility.
const dynamicHues = [
  ...read('globals.css').matchAll(/--color-dynamic-([a-z]+):/g),
].map((match) => match[1]!);

describe('Sorbet web hues', () => {
  it('gives every dynamic hue a Sorbet ink', () => {
    const covered = new Set([
      ...Object.keys(tokens.hues),
      ...Object.keys(webHues),
    ]);
    expect(dynamicHues.length).toBeGreaterThan(10);
    for (const hue of dynamicHues) {
      expect(covered.has(hue), hue).toBe(true);
      expect(blocks.light[hue], `light --${hue}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(blocks.dark[hue], `dark --${hue}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(blocks.light[`light-${hue}`]).toBe(`var(--${hue})`);
    }
  });

  it('matches the contract in sorbet.css and presets', () => {
    for (const [hue, value] of Object.entries(webHues)) {
      expect(blocks.light[hue], hue).toBe(value.light);
      expect(blocks.dark[hue], hue).toBe(value.dark);
      expect(blocks.highContrastLight[hue], hue).toBe(value.highContrast.light);
      expect(blocks.highContrastDark[hue], hue).toBe(value.highContrast.dark);
    }
  });

  it.each(['light', 'dark'] as const)(
    'keeps %s web-hue text at 4.5:1 on every Sorbet ground',
    (mode) => {
      const color = tokens.color[mode];
      for (const [hue, value] of Object.entries(webHues)) {
        for (const ground of ['background', 'surface', 'surface-sunken']) {
          expect(
            contrast(value[mode], color[ground]!),
            `${mode} ${hue} on ${ground}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  );

  it.each(['light', 'dark'] as const)(
    'keeps %s High Contrast web-hue text at 7:1',
    (mode) => {
      const palette = tokens.presets.palettes['high-contrast']![mode]!;
      for (const [hue, value] of Object.entries(webHues)) {
        for (const ground of ['ground', 'surface', 'card']) {
          expect(
            contrast(value.highContrast[mode], palette[ground] as string),
            `high-contrast ${mode} ${hue} on ${ground}`
          ).toBeGreaterThanOrEqual(7);
        }
      }
    }
  );
});
