import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SORBET_DENSITIES,
  SORBET_FONTS,
  SORBET_PRESETS,
  SORBET_RADII,
  SORBET_THEME_CONFIG_ID,
} from './components/ui/custom/sorbet-theme';
import { EXPERIMENTAL_SORBET_UI_CONFIG_ID } from './components/ui/custom/sorbet-ui';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

const css = readFileSync(
  resolve(repoRoot, 'packages/ui/src/sorbet.css'),
  'utf8'
);

type Mode = 'light' | 'dark';
type Hue = Record<Mode, { fill: string; calm: string; ink: string }>;

interface SorbetTokenContract {
  setting: {
    enabledConfigId: string;
    enabledDefault: boolean;
    themeConfigId: string;
    themeFields: Record<'preset' | 'radius' | 'density' | 'font', string[]>;
  };
  color: Record<Mode, Record<string, string>>;
  roles: Record<string, string>;
  presets: {
    sources: string[];
    roles: Record<string, string>;
    palettes: Record<string, Record<Mode, Record<string, unknown>>>;
  };
  radius: {
    popover: Record<string, number>;
    corners: Record<string, Record<string, number>>;
  };
  hues: Record<string, Hue>;
  motion: {
    duration: Record<string, number>;
    easing: Record<string, number[]>;
  };
  mobile: Record<
    | 'touchTarget'
    | 'inputFontSize'
    | 'gutter'
    | 'headerHeight'
    | 'dockHeight'
    | 'dockInset'
    | 'sheetRadius'
    | 'listRowMinHeight',
    number
  >;
}

const tokens = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/ui/src/sorbet-tokens.json'), 'utf8')
) as SorbetTokenContract;

/** Custom properties declared by the first rule whose selector is `selector`. */
function declarations(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Missing rule for ${selector}`);
  const open = css.indexOf('{', start);
  const body = css.slice(open + 1, css.indexOf('\n}', open));
  const found: Record<string, string> = {};
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    found[match[1]!] = match[2]!.replace(/\s+/g, ' ').trim();
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

const modes = {
  light: declarations(':root[data-ui="sorbet"] {'),
  dark: declarations(':root[data-ui="sorbet"].dark {'),
} as const;

/** Contract role → the semantic custom property sorbet.css sets for it. */
const ROLE_PROPERTIES = {
  ground: 'root-background',
  background: 'background',
  surface: 'card',
  'surface-sunken': 'secondary',
  accent: 'accent',
  border: 'border',
  'border-strong': 'input',
  foreground: 'foreground',
  'muted-foreground': 'muted-foreground',
  primary: 'primary',
  'primary-foreground': 'primary-foreground',
  destructive: 'destructive',
  'destructive-foreground': 'destructive-foreground',
  ring: 'ring',
} as const;

const CALENDAR_FILLS = {
  blue: 'blue',
  green: 'green',
  orange: 'orange',
  red: 'red',
  yellow: 'yellow',
  purple: 'purple',
  pink: 'pink',
  teal: 'cyan',
  gray: 'gray',
} as const;

const presetsCss = readFileSync(
  resolve(repoRoot, 'packages/ui/src/sorbet-presets.css'),
  'utf8'
).replace(/\/\*[\s\S]*?\*\//g, '');
const floatingCss = readFileSync(
  resolve(repoRoot, 'packages/ui/src/floating-surface.css'),
  'utf8'
);

/** Source colours and ink overrides per preview palette, read from the CSS. */
function cssPalettes() {
  const palettes: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const [, selector, body] of presetsCss.matchAll(
    /([^{}]+)\{([^{}]*)\}/g
  )) {
    const preview =
      /\[data-sorbet-preview="([\w-]+)"\](\[data-sorbet-preview-mode="dark"\])?/.exec(
        selector!
      );
    if (!preview) continue;
    const values = Object.fromEntries(
      [...body!.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [
        m[1]!,
        m[2]!.trim(),
      ])
    );
    const sources = Object.fromEntries(
      Object.entries(values)
        .filter(([name]) => name.startsWith('sorbet-'))
        .map(([name, value]) => [name.slice('sorbet-'.length), value])
    );
    if (Object.keys(sources).length !== tokens.presets.sources.length) continue;
    const inks = Object.fromEntries(
      Object.keys(tokens.hues)
        .filter((hue) => hue in values)
        .map((hue) => [hue, values[hue]])
    );
    const entry: Record<string, unknown> = { ...sources };
    if (Object.keys(inks).length > 0) entry.inks = inks;
    (palettes[preview[1]!] ??= {})[preview[2] ? 'dark' : 'light'] = entry;
  }
  return palettes;
}

const remToPx = (value: string) => Number.parseFloat(value) * 16;

describe('Sorbet token contract', () => {
  it('lists every palette exactly as sorbet-presets.css defines it', () => {
    expect(Object.keys(tokens.presets.palettes)).toEqual([...SORBET_PRESETS]);
    expect(tokens.presets.palettes).toEqual(cssPalettes());
    for (const palette of Object.values(tokens.presets.palettes)) {
      for (const mode of ['light', 'dark'] as const) {
        for (const source of tokens.presets.sources) {
          expect(palette[mode]![source], source).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
    expect(Object.keys(tokens.presets.roles)).toEqual(tokens.presets.sources);
  });

  it('keeps the default palette equal to the base colour roles', () => {
    for (const mode of ['light', 'dark'] as const) {
      const palette = tokens.presets.palettes.sorbet![mode]!;
      for (const [source, role] of Object.entries(tokens.presets.roles)) {
        expect(palette[source], `${mode} ${source}`).toBe(
          tokens.color[mode][role]
        );
      }
    }
  });

  it('names only real colour roles or hue variants in roles', () => {
    const roleNames = new Set(Object.keys(tokens.color.light));
    for (const [use, role] of Object.entries(tokens.roles)) {
      expect(roleNames.has(role) || ['fill', 'calm'].includes(role), use).toBe(
        true
      );
    }
  });

  it('matches the popover corners the web applies for each radius', () => {
    const corners = tokens.radius.corners;
    expect(Object.keys(corners)).toEqual([...SORBET_RADII]);
    for (const radius of SORBET_RADII) {
      expect(corners[radius]!.popover).toBe(tokens.radius.popover[radius]);
    }
    const sharp =
      /data-sorbet-radius='sharp'\][^{]*\{\s*--radius-popover:\s*([\d.]+)rem/.exec(
        floatingCss
      );
    const round =
      /data-sorbet-radius='round'\][^{]*\{\s*--radius-popover:\s*([\d.]+)rem/.exec(
        floatingCss
      );
    expect(remToPx(sharp![1]!)).toBe(corners.sharp!.popover);
    expect(remToPx(round![1]!)).toBe(corners.round!.popover);
    expect(corners.soft!.popover).toBe(corners.soft!.lg);
  });

  it('lists the same setting keys and allowlists as the runtime parsers', () => {
    expect(tokens.setting.enabledConfigId).toBe(
      EXPERIMENTAL_SORBET_UI_CONFIG_ID
    );
    expect(tokens.setting.enabledDefault).toBe(false);
    expect(tokens.setting.themeConfigId).toBe(SORBET_THEME_CONFIG_ID);
    expect(tokens.setting.themeFields.preset).toEqual([...SORBET_PRESETS]);
    expect(tokens.setting.themeFields.radius).toEqual([...SORBET_RADII]);
    expect(tokens.setting.themeFields.density).toEqual([...SORBET_DENSITIES]);
    expect(tokens.setting.themeFields.font).toEqual([...SORBET_FONTS]);
  });

  it.each(['light', 'dark'] as const)(
    'matches every %s colour role in sorbet.css',
    (mode) => {
      for (const [role, property] of Object.entries(ROLE_PROPERTIES)) {
        expect(modes[mode][property], `${mode} ${role} → --${property}`).toBe(
          tokens.color[mode][role]
        );
      }
      for (const [hue, value] of Object.entries(tokens.hues)) {
        expect(modes[mode][hue], `${mode} --${hue}`).toBe(value[mode].ink);
        const fill = CALENDAR_FILLS[hue as keyof typeof CALENDAR_FILLS];
        expect(modes[mode][`calendar-bg-${fill}`], `${mode} ${hue} calm`).toBe(
          value[mode].calm
        );
      }
    }
  );

  it.each(['light', 'dark'] as const)(
    'keeps %s text pairs at 4.5:1 and the focus ring at 3:1',
    (mode) => {
      const c = tokens.color[mode];
      const role = (name: string) => c[name]!;
      for (const ground of ['background', 'surface', 'surface-sunken']) {
        const g = role(ground);
        expect(contrast(role('foreground'), g)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(role('muted-foreground'), g)).toBeGreaterThanOrEqual(
          4.5
        );
        expect(contrast(role('ring'), g)).toBeGreaterThanOrEqual(3);
      }
      expect(
        contrast(role('primary'), role('primary-foreground'))
      ).toBeGreaterThanOrEqual(4.5);
      for (const [hue, value] of Object.entries(tokens.hues)) {
        const { fill, calm, ink } = value[mode];
        for (const ground of [
          fill,
          calm,
          role('surface'),
          role('background'),
        ]) {
          expect(
            contrast(ink, ground),
            `${mode} ${hue}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  );

  it('publishes motion and touch metrics as custom properties', () => {
    const light = modes.light;
    for (const [name, ms] of Object.entries(tokens.motion.duration)) {
      expect(light[`sorbet-duration-${name}`]).toBe(`${ms}ms`);
    }
    for (const [name, curve] of Object.entries(tokens.motion.easing)) {
      expect(light[`sorbet-ease-${name}`]).toBe(
        `cubic-bezier(${curve.join(', ')})`
      );
    }
    const m = tokens.mobile;
    expect(light['sorbet-touch-target']).toBe(`${m.touchTarget}px`);
    expect(light['sorbet-input-font-size']).toBe(`${m.inputFontSize}px`);
    expect(light['sorbet-gutter']).toBe(`${m.gutter}px`);
    expect(light['sorbet-header-height']).toBe(`${m.headerHeight}px`);
    expect(light['sorbet-dock-height']).toBe(`${m.dockHeight}px`);
    expect(light['sorbet-dock-inset']).toBe(`${m.dockInset}px`);
    expect(light['sorbet-sheet-radius']).toBe(`${m.sheetRadius}px`);
    expect(light['sorbet-list-row-min-height']).toBe(`${m.listRowMinHeight}px`);
  });

  it('scopes touch rules to coarse pointers and honours reduced motion', () => {
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
    expect(coarse).toContain('min-height: var(--sorbet-touch-target)');
    expect(coarse).toContain('@layer components');

    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    for (const name of ['fast', 'base', 'slow', 'sheet']) {
      expect(reduced).toContain(`--sorbet-duration-${name}: 0ms`);
    }
  });

  it('keeps every Sorbet selector under the data-ui attribute', () => {
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('{')
      .slice(0, -1)
      .map((chunk) => chunk.split(/[;}]/).pop()!.trim())
      .filter((selector) => selector && !selector.startsWith('@'));
    for (const selector of selectors) {
      expect(selector).toMatch(/^:root\[data-ui="sorbet"\]/);
    }
  });
});
