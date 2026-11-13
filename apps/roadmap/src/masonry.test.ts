/**
 * D79 tests for the masonry layout: CSS multi-column only (no script
 * layout), 1/2/3 columns at the page breakpoints, cards that never split,
 * and the equal-height grids left as grids. Each guard has a broken variant
 * that must fail.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, it } from 'node:test';
import { cssDeclarations, type Declaration } from './css-guards.ts';
import { readStyles } from './style-source.ts';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const css = readStyles();

/** Selector lists split at top-level commas. */
const selectorsOf = (declaration: Declaration) =>
  declaration.selector.split(/\s*,\s*/);

function declarationsFor(source: string, selector: string) {
  return cssDeclarations(source).filter((d) =>
    selectorsOf(d).includes(selector)
  );
}

/** Column count per breakpoint; 1 (normal flow) when none is declared. */
function columnCounts(source: string) {
  const at = (matches: (media: string) => boolean) => {
    const last = declarationsFor(source, '.masonry')
      .filter(
        (d) =>
          (d.property === 'column-count' || d.property === 'columns') &&
          matches(d.media.join(' '))
      )
      .at(-1);
    return last ? Number.parseInt(last.value, 10) : undefined;
  };
  const base = at((media) => media === '') ?? 1;
  const tablet = at((media) => media.includes('min-width: 720px')) ?? base;
  const desktop = at((media) => media.includes('min-width: 1024px')) ?? tablet;
  return { base, '720': tablet, '1024': desktop };
}

function itemRules(source: string) {
  const items = declarationsFor(source, '.masonry > *');
  const base = Object.fromEntries(
    items.filter((d) => !d.media.length).map((d) => [d.property, d.value])
  );
  const multi = Object.fromEntries(
    items
      .filter((d) => d.media.join(' ').includes('min-width: 720px'))
      .map((d) => [d.property, d.value])
  );
  return { base, multi };
}

const MASONRY = [
  {
    file: './components/tracks.tsx',
    container: '.track-list',
    tag: /<div className="track-list masonry"/,
  },
  {
    file: './components/timeline.tsx',
    container: '.period-groups',
    tag: /<div className="period-groups masonry">/,
  },
  {
    file: './components/hosting.tsx',
    container: '.method dl',
    tag: /<dl className="masonry">/,
  },
  {
    file: './components/migration.tsx',
    container: '.migration-list',
    tag: /<ul className="migration-list masonry"/,
  },
  {
    file: './components/workshop/capabilities.tsx',
    container: '.ws-groups',
    tag: /<div className="ws-groups masonry">/,
  },
];
const GRID_DECLARATIONS = new Set([
  'display',
  'grid-template-columns',
  'grid-template',
  'grid',
  'gap',
  'row-gap',
]);

describe('masonry: CSS columns at the page breakpoints', () => {
  it('is one column on phones, two from 720px, three from 1024px', () => {
    assert.deepEqual(columnCounts(css), { base: 1, '720': 2, '1024': 3 });
    // Broken variant: three columns from the tablet breakpoint.
    const tooMany = `.masonry { column-gap: 8px; }
      @media (min-width: 720px) { .masonry { column-count: 3; } }`;
    assert.notDeepEqual(columnCounts(tooMany), {
      base: 1,
      '720': 2,
      '1024': 3,
    });
    // Broken variant: multi-column on phones too.
    const phones = `.masonry { columns: 2; }
      @media (min-width: 720px) { .masonry { column-count: 2; } }
      @media (min-width: 1024px) { .masonry { column-count: 3; } }`;
    assert.equal(columnCounts(phones).base, 2);
  });

  it('keeps every card whole, spaced by margins rather than a gap', () => {
    const { base } = itemRules(css);
    assert.equal(base['break-inside'], 'avoid');
    assert.match(base['margin-block'] ?? '', /^0 var\(--masonry-gap/);
    const container = declarationsFor(css, '.masonry').map((d) => d.property);
    assert.ok(container.includes('column-gap'));
    assert.ok(!container.includes('gap') && !container.includes('row-gap'));
    // Broken variant: items without break-inside split across columns.
    const split = '.masonry > * { margin-block: 0 8px; }';
    assert.equal(itemRules(split).base['break-inside'], undefined);
  });

  it('renders items eagerly once there is more than one column', () => {
    // A skipped .track's 720px placeholder would rebalance the columns when
    // it renders and move cards already in view.
    assert.equal(itemRules(css).multi['content-visibility'], 'visible');
    // Phones (one column) keep skipping off-screen track cards.
    assert.equal(itemRules(css).base['content-visibility'], undefined);
    // Broken variant: no eager rule, so tracks keep their placeholders.
    const lazy = `@media (min-width: 720px) { .masonry { column-count: 2; } }`;
    assert.equal(itemRules(lazy).multi['content-visibility'], undefined);
  });
});

const KEPT_GRIDS = /\b(kpis|glance-grid|hosts|catchup)\b/;
const masonryUses = (sources: string[]) =>
  sources.flatMap(
    (source) => source.match(/className="[^"]*\bmasonry\b[^"]*"/g) ?? []
  );

describe('masonry: which sections use it', () => {
  it('the five card lists carry the class and lost their grid rules', () => {
    for (const { file, container, tag } of MASONRY) {
      assert.match(read(file), tag, file);
      const grid = declarationsFor(css, container).filter((d) =>
        GRID_DECLARATIONS.has(d.property)
      );
      assert.deepEqual(grid, [], container);
    }
    // Broken variant: a leftover grid rule overrides the columns.
    const leftover = '.track-list { display: grid; gap: 14px; }';
    assert.equal(
      declarationsFor(leftover, '.track-list').filter((d) =>
        GRID_DECLARATIONS.has(d.property)
      ).length,
      2
    );
  });

  it('equal-height rows stay on grid and never take the class', () => {
    for (const selector of ['.kpis', '.glance-grid', '.hosts', '.catchup']) {
      const columns = declarationsFor(css, selector).filter(
        (d) => d.property === 'grid-template-columns'
      );
      assert.ok(columns.length > 0, selector);
    }
    const sources = sourceFiles().map((file) => readFileSync(file, 'utf8'));
    const uses = masonryUses(sources);
    assert.equal(uses.length, MASONRY.length);
    assert.ok(!uses.some((use) => KEPT_GRIDS.test(use)));
    // Broken variant: the KPI tiles as masonry lose their equal heights.
    const broken = masonryUses([...sources, '<ul className="kpis masonry">']);
    assert.ok(broken.some((use) => KEPT_GRIDS.test(use)));
  });
});

describe('masonry: no script layout', () => {
  // Size observers, masonry libraries and script-set row spans or columns.
  const LAYOUT_JS =
    /ResizeObserver|from ['"][^'"]*masonry|gridRowEnd|gridRow\b|columnCount|grid-template-rows:\s*masonry/;
  /** "masonry" outside a className attribute means script touches it. */
  const scriptMasonry = (source: string) =>
    source
      .replace(/className="[^"]*"/g, '')
      .replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')
      .includes('masonry');

  it('no page or boot script measures or positions cards', () => {
    const offenders = sourceFiles().filter((file) => {
      const source = readFileSync(file, 'utf8');
      return LAYOUT_JS.test(source) || scriptMasonry(source);
    });
    assert.deepEqual(offenders, []);
    // Broken variants: a measuring effect, and script-set spans.
    assert.ok(
      LAYOUT_JS.test('const ro = new ResizeObserver(() => place(cards));')
    );
    assert.ok(
      scriptMasonry(
        "document.querySelector('.masonry').style.columnCount = '3';"
      )
    );
  });
});

/** Shipped page and boot sources (tests excluded). */
function sourceFiles(dir = new URL('./', import.meta.url).pathname): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}${name}`;
    if (statSync(path).isDirectory())
      return name === 'generated' ? [] : sourceFiles(`${path}/`);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}
