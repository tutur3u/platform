import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SORBET_PRESETS } from './components/ui/custom/sorbet-theme';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

function readUiFile(name: string) {
  return readFileSync(resolve(repoRoot, 'packages/ui/src', name), 'utf8');
}

type Tokens = Record<string, string>;

/** Custom properties declared by the first rule whose selector contains `selector`. */
function declarations(css: string, selector: string): Tokens {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Missing rule for ${selector}`);
  const open = css.indexOf('{', start);
  const body = css.slice(open + 1, css.indexOf('}', open));
  const tokens: Tokens = {};
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[match[1]!] = match[2]!.trim();
  }
  return tokens;
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

const presetsCss = readUiFile('sorbet-presets.css');
const baseCss = readUiFile('sorbet.css');
const baseLight = declarations(baseCss, ':root[data-ui="sorbet"] {');
const baseDark = declarations(baseCss, ':root[data-ui="sorbet"].dark {');
const STATUS_INKS = [
  'blue',
  'green',
  'orange',
  'red',
  'yellow',
  'purple',
  'pink',
  'teal',
  'gray',
];

const cases = SORBET_PRESETS.flatMap((preset) =>
  (['light', 'dark'] as const).map((mode) => ({ preset, mode }))
);

describe('Sorbet presets', () => {
  it.each(cases)(
    '$preset ($mode) meets the contrast targets',
    ({ preset, mode }) => {
      const selector =
        mode === 'dark'
          ? `[data-sorbet-preview="${preset}"][data-sorbet-preview-mode="dark"] {`
          : `[data-sorbet-preview="${preset}"] {`;
      const own = declarations(presetsCss, selector);
      const tokens: Tokens = {
        ...(mode === 'dark' ? baseDark : baseLight),
        ...own,
      };
      const text = preset === 'high-contrast' ? 7 : 4.5;

      const surfaces = ['sorbet-ground', 'sorbet-surface', 'sorbet-card'];
      const failures: string[] = [];
      const check = (fg: string, bg: string, minimum: number) => {
        const ratio = contrast(tokens[fg]!, tokens[bg]!);
        if (ratio < minimum) {
          failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${minimum}`);
        }
      };

      for (const surface of [...surfaces, 'sorbet-accent-soft']) {
        check('sorbet-ink', surface, text);
      }
      for (const surface of surfaces) {
        check('sorbet-muted-ink', surface, text);
        check('sorbet-ring', surface, 3);
        check('sorbet-accent', surface, 3);
        for (const ink of STATUS_INKS) check(ink, surface, text);
      }
      check('sorbet-accent-ink', 'sorbet-accent', text);

      expect(failures).toEqual([]);
    }
  );

  it('applies to <html> only through the preset attribute, leaving default Sorbet unchanged', () => {
    for (const preset of SORBET_PRESETS) {
      if (preset === 'sorbet') {
        expect(presetsCss).not.toContain('[data-sorbet-preset="sorbet"]');
      } else {
        expect(presetsCss).toContain(
          `:root[data-ui="sorbet"][data-sorbet-preset="${preset}"].dark`
        );
      }
    }
  });

  it('gives the mobile sidebar backdrop the Sorbet scrim', () => {
    expect(baseCss).toMatch(
      /\[data-slot="sidebar-backdrop"\]\) \{\s*background-color: var\(--sorbet-scrim/
    );
  });

  it('keeps white text on solid status fills readable in dark mode', () => {
    const rule = baseCss.slice(
      baseCss.indexOf(
        ':root[data-ui="sorbet"].dark\n  :where(\n    .bg-dynamic-'
      )
    );
    expect(rule).toContain(':where(.text-white)');
    expect(rule).toContain('color: var(--background);');
    for (const ink of STATUS_INKS) {
      expect(rule).toMatch(new RegExp(`\\.bg-dynamic-${ink}[,\\n]`));
    }
  });

  it('loads after the base Sorbet tokens', () => {
    const globals = readUiFile('globals.css');
    expect(globals.indexOf('@import "./sorbet-presets.css";')).toBeGreaterThan(
      globals.indexOf('@import "./sorbet.css";')
    );
  });
});
