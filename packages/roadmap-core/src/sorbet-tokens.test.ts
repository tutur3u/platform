/**
 * The roadmap's design tokens derive from Sorbet (packages/ui/src/sorbet.css):
 * the default Sorbet blocks are pinned byte for byte, the roadmap maps
 * --rm-* onto the stable Sorbet names only, every text pair it uses meets
 * WCAG AA in light and dark, and only the roadmap pages opt into Sorbet
 * (run via src/roadmap-data.test.ts).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { sorbetPage } from './sorbet-page.ts';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const SORBET = read('../../../packages/ui/src/sorbet.css');
const GLOBALS = read('../../../packages/ui/src/globals.css');
const TOKENS = read('./styles/tokens.css');

const LIGHT = ':root[data-ui="sorbet"] {';
const DARK = ':root[data-ui="sorbet"].dark {';

/** The rule starting at `selector`, through its closing brace. */
export function block(css: string, selector: string) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing ${selector}`);
  return css.slice(start, css.indexOf('\n}', start) + 2);
}

/** Custom properties declared in a block (comments dropped). */
export function properties(rule: string) {
  const body = rule.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map(
    [...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
      m[1] as string,
      (m[2] as string).replace(/\s+/g, ' ').trim(),
    ])
  );
}

const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');

/**
 * Sorbet's stable public surface (Sorbet-Owner, D194): semantic colours,
 * status inks, calendar fills, radii, the two shadows and the eleven
 * --sorbet-* preset source names. The roadmap may read nothing else from
 * packages/ui.
 */
const STABLE =
  /^--(background|foreground|card|primary|muted-foreground|border|input|ring|accent|sidebar-[a-z-]+|blue|green|orange|red|yellow|purple|pink|teal|gray|calendar-bg-[a-z]+|radius|radius-xl|radius-2xl|sorbet-shadow-sm|sorbet-shadow-md|sorbet-(ground|surface|card|ink|muted-ink|hairline|input|accent|accent-ink|accent-soft|ring))$/;

const PINNED = {
  light: '8eaca8fcac14104f959b98a8a4b176bf7f156d4485da796c3edbba6be2d1c748',
  dark: '8f8e86c8904b57667fad41fb83a848ee2132f0135d3294fef70378e4c19ad7d9',
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

const channels = (hex: string) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** `fg` at `alpha` over an opaque `bg`, as browsers blend in sRGB. */
export function composite(fg: string, alpha: number, bg: string) {
  const [a, b] = [channels(fg), channels(bg)];
  return toHex(a.map((c, i) => c * alpha + (b[i] as number) * (1 - alpha)));
}

/**
 * A colour value as the stylesheet writes it: a variable, or
 * color-mix(in srgb, A N%, B | transparent). Returns the colour and its
 * opacity (a mix with transparent keeps A's colour at N%).
 */
export function evaluate(
  value: string,
  lookup: (name: string) => string | undefined
): { hex: string; alpha: number } {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return { hex: v.toLowerCase(), alpha: 1 };
  if (/^#[0-9a-f]{3}$/i.test(v))
    return {
      hex: `#${[...v.slice(1)].map((c) => c + c).join('')}`.toLowerCase(),
      alpha: 1,
    };
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(v)?.[1];
  if (ref) {
    const next = lookup(ref);
    assert.ok(next, `${ref} is not defined`);
    return evaluate(next, lookup);
  }
  const mix =
    /^color-mix\(in srgb,\s*(var\(--[a-z0-9-]+\))\s+([\d.]+)%,\s*(var\(--[a-z0-9-]+\)|transparent)\)$/.exec(
      v
    );
  assert.ok(mix, `${v} is not a value the contrast check can evaluate`);
  const a = evaluate(mix[1] as string, lookup);
  const p = Number(mix[2]) / 100;
  if (mix[3] === 'transparent') return { hex: a.hex, alpha: a.alpha * p };
  const b = evaluate(mix[3] as string, lookup);
  return { hex: composite(a.hex, p, b.hex), alpha: 1 };
}

/** --rm-* resolved to opaque hex through one Sorbet mode. */
function resolve(
  mapping: Map<string, string>,
  sorbet: Map<string, string>
): Map<string, string> {
  return new Map(
    [...mapping].map(([name, value]) => {
      const color = evaluate(value, (n) => mapping.get(n) ?? sorbet.get(n));
      assert.equal(color.alpha, 1, `${name}: ${value} is not opaque`);
      return [name, color.hex];
    })
  );
}

const COLOUR = /^--rm-(?!radius|shadow|text-|space-)/;
const colours = (mapping: Map<string, string>) =>
  new Map([...mapping].filter(([name]) => COLOUR.test(name)));

/** Text on surface, 4.5:1: every pair the roadmap draws. */
const TEXT_PAIRS: [string, string][] = [
  ['--rm-ink', '--rm-bg'],
  ['--rm-ink', '--rm-panel'],
  ['--rm-ink', '--rm-soft'],
  ['--rm-muted', '--rm-bg'],
  ['--rm-muted', '--rm-panel'],
  ['--rm-muted', '--rm-soft'],
  ['--rm-muted', '--rm-planned-fill'],
  ['--rm-ink', '--rm-sync-fill'],
  // The hero's live-state pill.
  ['--rm-ink', '--rm-live-fill'],
  ['--rm-ink', '--rm-progress-fill'],
  ['--rm-ink', '--rm-planned-fill'],
  ['--rm-live-text', '--rm-sync-fill'],
  ['--rm-progress-text', '--rm-sync-fill'],
  ['--rm-sync-text', '--rm-sync-fill'],
  ['--rm-live-text', '--rm-live-fill'],
  ['--rm-merge-text', '--rm-merge-fill'],
  ['--rm-progress-text', '--rm-progress-fill'],
  ...['live', 'sync', 'merge', 'progress'].flatMap((s): [string, string][] => [
    [`--rm-${s}-text`, '--rm-panel'],
    [`--rm-${s}-text`, '--rm-bg'],
  ]),
];
/** Focus ring and status marks (bars, dots, rings), 3:1. */
const MARK_PAIRS: [string, string][] = [
  ['--rm-ring', '--rm-bg'],
  ['--rm-ring', '--rm-panel'],
  ...['live', 'sync', 'merge', 'progress', 'planned'].map(
    (s): [string, string] => [`--rm-${s}`, '--rm-panel']
  ),
  // Status bars and rings sit on the soft track.
  ...['live', 'sync', 'merge', 'progress', 'planned'].map(
    (s): [string, string] => [`--rm-${s}`, '--rm-soft']
  ),
  ['--rm-chart-workers-edge', '--rm-panel'],
  ['--rm-chart-muted', '--rm-soft'],
];

const SECTION_7 = read('./styles/section-7.css');

/**
 * The pulse chart as drawn: each series' effective colour (after any
 * opacity) against the card and against the hover band (ink at its
 * opacity, composited over the card), both 3:1. The legend swatches use
 * the same series variables on the card.
 */
export function chartFailures(tokens: Map<string, string>, css = SECTION_7) {
  const series = properties(block(css, '.pulse-section {'));
  const hoverFill = /\.pchart-hover \{\s*fill: ([^;]+);/.exec(css)?.[1];
  assert.ok(hoverFill, 'the hover band fill');
  const lookup = (n: string) => series.get(n) ?? tokens.get(n);
  const panel = tokens.get('--rm-panel') as string;
  const hover = evaluate(hoverFill, lookup);
  const backgrounds = {
    card: panel,
    'hover band': composite(hover.hex, hover.alpha, panel),
  };
  const marks = {
    'all PRs (--pc-all)': lookup('--pc-all') as string,
    'tracked (--pc-tracked)': lookup('--pc-tracked') as string,
    'in production (--pc-prod)': lookup('--pc-prod') as string,
    'moving average (--rm-ink)': 'var(--rm-ink)',
    'no-data outline (--rm-muted)': 'var(--rm-muted)',
  };
  const out: string[] = [];
  for (const [mark, value] of Object.entries(marks)) {
    const color = evaluate(value, lookup);
    for (const [where, bg] of Object.entries(backgrounds)) {
      const ratio = contrast(composite(color.hex, color.alpha, bg), bg);
      if (!(ratio >= 3)) out.push(`${mark} on ${where}: ${ratio.toFixed(2)}`);
    }
  }
  return out;
}

function failures(tokens: Map<string, string>) {
  const out: string[] = [];
  for (const [pairs, min] of [
    [TEXT_PAIRS, 4.5],
    [MARK_PAIRS, 3],
  ] as const)
    for (const [fg, bg] of pairs) {
      const ratio = contrast(tokens.get(fg) ?? '', tokens.get(bg) ?? '');
      if (!(ratio >= min)) out.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
  return out;
}

describe('design tokens: Sorbet parity', () => {
  it('pins the default Sorbet blocks byte for byte', () => {
    // If Sorbet changes its default palette, re-run the contrast checks
    // below against the new values, review the roadmap, then update these.
    assert.equal(sha256(block(SORBET, LIGHT)), PINNED.light);
    assert.equal(sha256(block(SORBET, DARK)), PINNED.dark);
    // Broken variant: one changed byte in the default block fails the pin.
    const drifted = block(SORBET, LIGHT).replace(
      '--background: #fffbfa;',
      '--background: #fffbfb;'
    );
    assert.notEqual(drifted, block(SORBET, LIGHT));
    assert.notEqual(sha256(drifted), PINNED.light);
    // The page ships them through the shared globals.css it imports.
    assert.match(GLOBALS, /@import "\.\/sorbet\.css";/);
    assert.match(
      read('./styles/section-1.css'),
      /@import "@tuturuuu\/ui\/globals\.css";/
    );
  });

  it('maps every --rm-* token onto stable Sorbet names only', () => {
    const mapping = properties(block(TOKENS, LIGHT));
    const legacy = properties(block(TOKENS, ':root {'));
    // Every colour, radius and shadow token the page reads is remapped.
    for (const name of legacy.keys())
      if (!/^--rm-(text|space)-/.test(name))
        assert.ok(mapping.has(name), `${name} has no Sorbet mapping`);
    for (const [name, value] of mapping) {
      for (const ref of value.matchAll(/var\((--[a-z0-9-]+)\)/g))
        assert.match(ref[1] as string, STABLE, `${name} reads ${ref[1]}`);
    }
    // The preset source names are stable (Sorbet-Owner); anything else in
    // packages/ui is not. Broken variants: those names are refused.
    assert.match('--sorbet-accent-soft', STABLE);
    for (const unstable of [
      '--cyan',
      '--muted',
      '--chart-1',
      '--root-background',
      '--sorbet-custom-accent',
    ])
      assert.doesNotMatch(unstable, STABLE);
  });

  // In dark both Sorbet rules match <html> and the .dark block overrides
  // colours; the roadmap's own dark block does the same for its tokens.
  const light = properties(block(SORBET, LIGHT));
  const dark = new Map([...light, ...properties(block(SORBET, DARK))]);
  const mapping = colours(properties(block(TOKENS, LIGHT)));
  const darkMapping = new Map([...mapping, ...properties(block(TOKENS, DARK))]);
  const modes = [
    ['light', resolve(mapping, light)],
    ['dark', resolve(darkMapping, dark)],
  ] as const;

  it('meets WCAG AA for every text pair, light and dark', () => {
    for (const [mode, tokens] of modes)
      assert.deepEqual(failures(tokens), [], mode);
    // Broken variant: a pastel fill used as text fails the check.
    const broken = new Map(mapping);
    broken.set('--rm-live-text', 'var(--calendar-bg-green)');
    assert.ok(
      failures(resolve(broken, light)).some((f) =>
        f.startsWith('--rm-live-text on')
      ),
      'the checker must catch a fill used as text'
    );
  });

  it('draws every pulse-chart mark at 3:1 or more, composited, light and dark', () => {
    for (const [mode, tokens] of modes)
      assert.deepEqual(chartFailures(tokens), [], mode);
    // Broken variant: the earlier "all PRs" colour, ink at 46% opacity,
    // composites to about 2.8:1 on the light card.
    const old = SECTION_7.replace(
      '--pc-all: var(--rm-chart-muted);',
      '--pc-all: color-mix(in srgb, var(--rm-ink) 46%, transparent);'
    );
    assert.notEqual(old, SECTION_7);
    const [, lightTokens] = modes[0];
    assert.ok(
      chartFailures(lightTokens, old).some((f) =>
        f.startsWith('all PRs (--pc-all) on card: 2.8')
      ),
      JSON.stringify(chartFailures(lightTokens, old))
    );
  });
});

describe('design tokens: which pages render in Sorbet', () => {
  it('the roadmap in both languages, never the workshop pages', () => {
    for (const path of [
      '/',
      '/vi',
      '/vi/',
      '/roadmap',
      '/roadmap/',
      '/roadmap/vi',
      '/roadmap/vi/',
    ])
      assert.equal(sorbetPage(path), true, path);
    for (const path of [
      '/workshops/edufest-2026',
      '/vi/workshops/edufest-2026',
      '/roadmap/workshops/edufest-2026',
      '/roadmap/vi/workshops/edufest-2026',
      '/roadmap/missing',
      '/roadmapx',
    ])
      assert.equal(sorbetPage(path), false, path);
  });

  it('the root document sets data-ui on <html> in the server HTML', () => {
    const root = read('../../../apps/roadmap/src/routes/__root.tsx');
    assert.match(
      root,
      /data-ui=\{sorbetPage\(pathname\) \? 'sorbet' : undefined\}/
    );
  });
});
