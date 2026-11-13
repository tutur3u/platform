import { readStyles } from './style-source.ts';
/**
 * D79 accessibility guards for the shared marketing shell as the roadmap
 * renders it (run via src/roadmap-data.test.ts).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const shell = (file: string) =>
  readFileSync(
    new URL(`../../../packages/marketing-shell/src/${file}`, import.meta.url),
    'utf8'
  );

type Rgb = [number, number, number];

function hsl(h: number, s: number, l: number): Rgb {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function luminance([r, g, b]: Rgb) {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast of `foreground` at `alpha` over `background` (WCAG 2.x). */
function contrast(foreground: Rgb, alpha: number, background: Rgb) {
  const mixed = foreground.map(
    (c, i) => c * alpha + (background[i] as number) * (1 - alpha)
  ) as Rgb;
  const [hi, lo] = [luminance(mixed), luminance(background)].sort(
    (x, y) => y - x
  );
  return ((hi as number) + 0.05) / ((lo as number) + 0.05);
}

/** The page background and foreground of each theme (packages/ui globals.css). */
const THEMES = {
  light: { background: hsl(20, 60, 98), foreground: hsl(0, 0, 3.9) },
  dark: { background: hsl(0, 4, 10), foreground: hsl(0, 0, 98) },
};

/** Opacity of every small mono label's text colour in a component source. */
function monoLabelAlphas(source: string) {
  return [...source.matchAll(/className="([^"]*\bfont-mono-ui\b[^"]*)"/g)]
    .map((match) => /\btext-foreground\/(\d+)\b/.exec(match[1] ?? ''))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => Number(match[1]) / 100);
}

function contrastFailures(source: string) {
  const failures: string[] = [];
  for (const alpha of monoLabelAlphas(source))
    for (const [name, theme] of Object.entries(THEMES)) {
      const ratio = contrast(theme.foreground, alpha, theme.background);
      if (ratio < 4.5)
        failures.push(
          `${name}: foreground/${alpha * 100} is ${ratio.toFixed(2)}:1`
        );
    }
  return failures;
}

describe('a11y: shared footer labels', () => {
  it('every mono label reaches 4.5:1 in light and dark', () => {
    const footer = shell('footer.tsx');
    assert.ok(monoLabelAlphas(footer).length >= 3);
    assert.deepEqual(contrastFailures(footer), []);
    // Broken variant: the old foreground/35 labels (3.13:1 on dark).
    const broken = contrastFailures(
      '<span className="font-mono-ui text-[0.6rem] text-foreground/35 uppercase">'
    );
    assert.equal(broken.length, 2, broken.join('; '));
  });
});

describe('a11y: shared navbar logo', () => {
  const navbar = shell('navbar.tsx');
  const logo = navbar.slice(
    navbar.indexOf('<ImageComponent'),
    navbar.indexOf('</LinkComponent>')
  );

  it('the logo is decorative next to the brand name (image-redundant-alt)', () => {
    assert.match(logo, /<ImageComponent\s+alt=""/);
    assert.match(logo, />\s*Tuturuuu\s*<\/span>/);
    // Broken variant: alt text that repeats the adjacent name.
    assert.doesNotMatch(
      '<ImageComponent alt="Tuturuuu"',
      /<ImageComponent\s+alt=""/
    );
  });

  it('the brand name stays the link text on small screens (sr-only, not hidden)', () => {
    assert.match(logo, /'sr-only [^']*md:not-sr-only/);
    assert.doesNotMatch(logo, /'hidden font-bold/);
  });
});

describe('a11y: the compact navbar keeps the logo link named', () => {
  const css = readStyles();
  /** Declarations of every rule whose selector list hides the brand name. */
  const brandRules = (source: string) =>
    [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((match) =>
        (match[1] ?? '')
          .split(',')
          .some((selector) =>
            /#navbar-content a > span\s*$/.test(selector.trim())
          )
      )
      .map((match) => match[2] ?? '');
  const removesName = (source: string) =>
    brandRules(source).some((body) =>
      /display:\s*none|visibility:\s*hidden/.test(body)
    );

  it('hides the brand name visually, not from the accessibility tree', () => {
    assert.ok(brandRules(css).length >= 1);
    assert.equal(removesName(css), false);
    // Broken variant: display: none leaves the link with no accessible name
    // once the logo image is decorative (axe link-name).
    assert.equal(
      removesName(
        '.roadmap[data-nav-compact] #navbar-content > div:last-child,\n.roadmap[data-nav-compact] #navbar-content a > span {\n  display: none;\n}'
      ),
      true
    );
  });
});

describe('a11y: workshop pages keep the navbar controls', () => {
  const css = readStyles();
  /** Selectors that hide the navbar's actions group (menu, language, theme). */
  const hidesActions = (source: string) =>
    [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((match) => /display:\s*none/.test(match[2] ?? ''))
      .flatMap((match) => (match[1] ?? '').split(','))
      .map((selector) => selector.replace(/\s+/g, ' ').trim())
      .filter((selector) =>
        selector.endsWith('#navbar-content > div:last-child')
      );

  it('only the docked roadmap hides them, never an always-compact workshop page', () => {
    const selectors = hidesActions(css);
    assert.ok(selectors.length >= 1);
    for (const selector of selectors)
      assert.match(selector, /:not\(\.workshop\)/, selector);
    // Broken variant: an unscoped rule also matches EduFest
    // (class "roadmap workshop", always data-nav-compact), which then has
    // no menu, language switch or theme toggle at any width.
    const broken = hidesActions(
      '.roadmap[data-nav-compact] #navbar-content > div:last-child { display: none; }'
    );
    assert.ok(broken.some((selector) => !/:not\(\.workshop\)/.test(selector)));
  });
});
