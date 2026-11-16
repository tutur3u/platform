/**
 * D79 tests for the explanations behind (i) buttons and tooltips
 * (components/info.tsx), run via src/roadmap-data.test.ts. The pre-seal
 * doctor checks the same contract on the built Worker's server HTML
 * (scripts/doctor-markup.mjs, infoPopoverFailures). Each guard has a broken
 * variant that must fail.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import en from '../messages/en.json' with { type: 'json' };
import vi from '../messages/vi.json' with { type: 'json' };
import { cssDeclarations } from './css-guards.ts';
import { REFRESH_MS } from './live/runtime-refresh.ts';
import { readStyles } from './style-source.ts';

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const INFO = read('./components/info.tsx');

/** The JSX of one exported component in `source`. */
function component(source: string, name: string) {
  const start = source.indexOf(`export function ${name}(`);
  if (start < 0) return '';
  const next = source.indexOf('\nexport function ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

/** The opening tag of the first `<tag` after `marker` in `source`. */
function openingTag(source: string, marker: string, tag: string) {
  const at = source.indexOf(marker);
  if (at < 0) return '';
  const start = source.indexOf(`<${tag}`, at);
  return start < 0 ? '' : source.slice(start, source.indexOf('>\n', start));
}

describe('info: "How statuses are computed" leaves the page flow', () => {
  /** True when the page has no Method section and the hero has the popover. */
  const moved = (page: string, hosting: string, hero: string) =>
    !/<Method\b/.test(page) &&
    !hosting.includes('method-title') &&
    /<InfoPopover\s+id="status-method"/.test(component(hero, 'StatusMethod')) &&
    /<dd>\{t\.method\[s\]\}<\/dd>/.test(component(hero, 'StatusMethod')) &&
    hero.includes('{t.method.sources}') &&
    /<StatusMethod t=\{t\} \/>/.test(component(hero, 'OverallBar'));

  it('is a popover beside the status legend, with every definition', () => {
    const page = read('./pages/roadmap.tsx');
    const hosting = read('./components/hosting.tsx');
    const hero = read('./components/hero.tsx');
    assert.equal(moved(page, hosting, hero), true);
    // Broken variant: the old section rendered at the end of the page.
    const inFlow = page.replace('<Footer', '<Method t={t} />\n        <Footer');
    assert.notEqual(inFlow, page);
    assert.equal(moved(inFlow, hosting, hero), false);
    // Broken variant: the legend without its (i) button.
    assert.equal(
      moved(page, hosting, hero.replace('<StatusMethod t={t} />', '')),
      false
    );
  });

  it('keeps its content in the server HTML (no render-on-open portal)', () => {
    const popover = component(INFO, 'InfoPopover');
    const rendered = (source: string) =>
      /popover="auto"/.test(source) &&
      /\{children\}/.test(source) &&
      !/\{open\s*(\?|&&)/.test(source) &&
      !/createPortal|@radix-ui/.test(source);
    assert.equal(rendered(popover), true);
    // Broken variant: children rendered only while open.
    assert.equal(
      rendered(popover.replace('{children}', '{open && children}')),
      false
    );
  });
});

describe('info: (i) buttons are named, keyboard-operable disclosures', () => {
  /** A native button that opens and controls its popover by id. */
  const disclosure = (source: string) => {
    const button = openingTag(
      component(source, 'InfoPopover'),
      'return',
      'button'
    );
    return (
      /type="button"/.test(button) &&
      /popoverTarget=\{id\}/.test(button) &&
      /aria-controls=\{id\}/.test(button) &&
      /aria-expanded=\{open\}/.test(button) &&
      /aria-label=\{label\}/.test(button) &&
      // Escape and a tap outside close an auto popover natively, and the
      // toggle event keeps aria-expanded true to the open state.
      /popover="auto"/.test(source) &&
      /onToggle=\{\(event\) => setOpen\(event\.newState === 'open'\)\}/.test(
        source
      )
    );
  };

  it('Enter/Space open (native button), Escape closes (auto popover)', () => {
    assert.equal(disclosure(INFO), true);
    // Broken variants: a div trigger has no Enter/Space activation; a
    // manual popover ignores Escape; no expanded state for screen readers.
    assert.equal(
      disclosure(
        INFO.replace(
          '<button\n        type="button"\n        className="info-btn"',
          '<div\n        className="info-btn"'
        )
      ),
      false
    );
    assert.equal(
      disclosure(INFO.replace('popover="auto"', 'popover="manual"')),
      false
    );
    assert.equal(disclosure(INFO.replace('aria-expanded={open}', '')), false);
  });

  it('every section (i) button gets a distinct, translated name', () => {
    const shared = read('./components/shared.tsx');
    assert.match(
      shared,
      /label=\{t\.info\.about\.replace\('\{title\}', title\)\}/
    );
    assert.match(shared, /id=\{`\$\{id\}-about`\}/);
    for (const messages of [en, vi]) {
      assert.ok(messages.info.about.includes('{title}'));
      assert.ok(messages.info.close.length > 0);
    }
  });
});

describe('info: status badges and legend items have definition tooltips', () => {
  /** A described button that also opens on focus, not on hover only. */
  const accessibleTooltip = (source: string) => {
    const tooltip = component(source, 'Tooltip');
    const button = openingTag(tooltip, 'return', 'button');
    return (
      /type="button"/.test(button) &&
      /aria-describedby=\{id\}/.test(button) &&
      /popoverTarget=\{id\}/.test(button) &&
      /popoverTargetAction="show"/.test(button) &&
      /onFocus=\{show\}/.test(button) &&
      /onBlur=\{hide\}/.test(button) &&
      /role="tooltip"/.test(tooltip) &&
      /popover=\{kind\}/.test(tooltip)
    );
  };

  it('a tooltip is described, opens on focus, tap and keys, and Escape closes it', () => {
    assert.equal(accessibleTooltip(INFO), true);
    // Broken variants: hover-only, and no description for screen readers.
    assert.equal(accessibleTooltip(INFO.replace('onFocus={show}', '')), false);
    assert.equal(
      accessibleTooltip(INFO.replace('aria-describedby={id}', '')),
      false
    );
  });

  it('every status in the legend and every status badge with an id has one', () => {
    const hero = read('./components/hero.tsx');
    const shared = read('./components/shared.tsx');
    const timeline = read('./components/timeline.tsx');
    const legend = (source: string) =>
      /<Tooltip id=\{`tip-status-\$\{s\}`\} tip=\{t\.method\[s\]\}>/.test(
        component(source, 'OverallBar')
      );
    const badge = (source: string) =>
      /<Tooltip id=\{tipId\} tip=\{t\.method\[status\]\}/.test(
        component(source, 'StatusBadge')
      );
    assert.equal(legend(hero), true);
    assert.equal(badge(shared), true);
    // Both timeline badges (period rows and "Planned next") pass an id.
    assert.equal(timeline.match(/tipId=\{`tip-/g)?.length, 2);
    // Broken variants: a plain legend item; a badge without its definition.
    assert.equal(
      legend(
        hero.replace('<Tooltip id={`tip-status-', '<span id={`tip-status-')
      ),
      false
    );
    assert.equal(
      badge(shared.replace('tip={t.method[status]}', 'tip=""')),
      false
    );
  });
});

describe('info: nothing new runs inline, and nothing moves', () => {
  const INLINE = /<script|dangerouslySetInnerHTML|\bon[a-z]+="/i;

  it('adds no inline script or inline event handler', () => {
    for (const file of [
      './components/info.tsx',
      './components/hero.tsx',
      './components/shared.tsx',
      './components/migration.tsx',
      './components/insights/pulse-section.tsx',
    ])
      assert.doesNotMatch(read(file), INLINE, file);
    // Broken variant: a click handler written into the markup.
    assert.match('<button onclick="this.nextSibling.showPopover()">', INLINE);
  });

  it('popovers stay in the top layer and triggers reserve their size', () => {
    const css = readStyles();
    const declarations = cssDeclarations(css);
    const position = (source: string) =>
      cssDeclarations(source).filter(
        (d) =>
          /\.(info|tip)-pop(?![\w-])/.test(d.selector) &&
          ['position', 'display', 'float'].includes(d.property)
      );
    // The UA popover rule (position: fixed, top layer) is never overridden.
    assert.deepEqual(position(css), []);
    const size = (property: string) =>
      declarations.find(
        (d) => d.selector === '.info-btn' && d.property === property
      )?.value;
    assert.equal(size('width'), '28px');
    assert.equal(size('height'), '28px');
    // Broken variant: an in-flow panel pushes the content below it.
    assert.equal(position('.info-pop { position: relative; }').length, 1);
  });
});

describe('info: English and Vietnamese stay in step', () => {
  it('the new strings exist in both languages', () => {
    assert.deepEqual(Object.keys(en.info), Object.keys(vi.info));
    assert.deepEqual(
      Object.keys(en.migration.rules),
      Object.keys(vi.migration.rules)
    );
    assert.ok(!('method' in en.migration) && !('method' in vi.migration));
    // The sources line states the real refresh cadence.
    const minutes = REFRESH_MS / 60_000;
    assert.ok(en.method.sources.includes(`every ${minutes} minutes`));
    assert.ok(vi.method.sources.includes(`mỗi ${minutes} phút`));
    // Broken variant: a cadence the page does not keep.
    assert.ok(
      !'refreshes every 10 minutes'.includes(`every ${minutes} minutes`)
    );
  });
});
