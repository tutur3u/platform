import { readStyles } from './style-source.ts';
import en from '../messages/en.json' with { type: 'json' };
import vi from '../messages/vi.json' with { type: 'json' };
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseChangelog } from './changelog/schema.ts';
import { comingSoon } from './content/coming-soon.ts';
import { localDay } from './live/feed.ts';
const source = (file: string) =>
  readFileSync(new URL(file, import.meta.url), 'utf8');

test('real parser accepts fallback, rejects markup and malformed releases', () => {
  const fixture = JSON.parse(source('./changelog/fixtures/changelog.json'));
  assert.equal(parseChangelog(fixture)?.mode, 'fallback');
  assert.equal(parseChangelog({ ...fixture, schema: 2 }), null);
  fixture.releases[0].summary.en = '<b>bad</b>';
  assert.equal(parseChangelog(fixture), null);
  const notes = source('./components/insights/patch-notes.tsx');
  const guard = (s: string) =>
    /if \(!changelog\?\.releases\.length\) return null/.test(s) &&
    s.includes('t.notes.fallback') &&
    s.includes('model: changelog.model');
  assert.ok(guard(notes));
  assert.ok(!guard(notes.replace('t.notes.fallback', "''")));
  assert.ok(
    !guard(notes.replace('if (!changelog?.releases.length) return null;', ''))
  );
});
test('catch-up single column follows release count, including an empty parsed object', () => {
  const page = source('./pages/roadmap.tsx');
  const guard = (s: string) =>
    s.includes("changelog?.releases.length ? '' : ' catchup-single'");
  assert.ok(guard(page));
  assert.ok(
    !guard(page.replace('changelog?.releases.length ?', 'changelog ?'))
  );
});
test('release dates use the Vietnam local day at UTC midnight boundary', () => {
  const iso = '2026-11-12T18:00:00Z';
  assert.equal(localDay(iso), '2026-11-13');
  assert.notEqual(iso.slice(0, 10), localDay(iso));
  const notes = source('./components/insights/patch-notes.tsx');
  assert.ok(notes.includes('shortDay(localDay(release.date), lang)'));
  assert.ok(
    !notes
      .replace('localDay(release.date)', 'release.date.slice(0, 10)')
      .includes('shortDay(localDay(release.date), lang)')
  );
});
test('Mira announcement localizes title and body without changing prices', () => {
  const item = comingSoon[0];
  for (const key of ['title', 'body'] as const)
    assert.notEqual(item[key].en, item[key].vi);
  assert.doesNotMatch(item.body.vi, /subscription plans|\/month/);
  assert.match(item.body.vi, /\$100 và \$200\/tháng/);
  assert.match(item.body.en, /\$100 and \$200\/month/);
  const hero = source('./components/hero.tsx');
  assert.ok(hero.includes('item.body[lang]'));
  assert.ok(
    !hero.replace('item.body[lang]', 'item.body.en').includes('item.body[lang]')
  );
});
test('EduFest actions reserve at least 24px height', () => {
  const css = readStyles();
  const guard = (s: string) =>
    /\.ws-event-links a \{[^}]*min-height: (\d+)px/.exec(s)?.[1];
  assert.ok(Number(guard(css)) >= 24);
  assert.ok(
    !(
      Number(guard(css.replace('min-height: 24px;', 'min-height: 23px;'))) >= 24
    )
  );
});

test('split CSS keeps the UI scan exclusion at the repository components directory', () => {
  // The app's stylesheet entry loads the shared globals and scopes their scan.
  const path = new URL('../../../apps/roadmap/src/styles.css', import.meta.url);
  const css = readFileSync(path, 'utf8');
  const expected = new URL(
    '../../../packages/ui/src/components',
    import.meta.url
  ).pathname;
  const matches = (text: string) => {
    const target = /@source not '([^']*packages\/ui\/src\/components)'/.exec(
      text
    )?.[1];
    return target && new URL(target, path).pathname === expected;
  };
  assert.ok(matches(css));
  assert.ok(!matches(css.replace('../../../packages/ui', '../../packages/ui')));
});
test('the four detail tabs retain their sections below either roadmap lead', () => {
  const page = source('./pages/roadmap.tsx');
  /** The source of one panel in the page's `panels` object. */
  const panel = (s: string, tab: string, next: string | null) =>
    s.slice(
      s.indexOf(`\n    ${tab}: (`),
      next ? s.indexOf(`\n    ${next}: (`) : s.indexOf('\n  };')
    );
  const placed = (s: string) => {
    const at = {
      overview: panel(s, 'overview', 'progress'),
      progress: panel(s, 'progress', 'activity'),
      activity: panel(s, 'activity', 'infrastructure'),
      infrastructure: panel(s, 'infrastructure', null),
    };
    return (
      ['<TrackGlance', '<ComingSoon', '<UpdatesTeaser'].every((c) =>
        at.overview.includes(c)
      ) &&
      ['<OverallBar', '<TracksSection', '<TimelineSection'].every((c) =>
        at.progress.includes(c)
      ) &&
      [
        '<ShippedTile',
        '<PulseSection',
        '<ProductionUpdates',
        '<PatchNotes',
      ].every((c) => at.activity.includes(c)) &&
      ['<HostingSection', '<MigrationSection'].every((c) =>
        at.infrastructure.includes(c)
      )
    );
  };
  assert.ok(placed(page));
  // Broken variant: the shipping pulse back on the Overview tab.
  const moved = page
    .replace('<PulseSection', '<PulseChart')
    .replace('<TrackGlance', '<PulseSection /><TrackGlance');
  assert.ok(!placed(moved));
  // The hero keeps three figures and when the data was read.
  const hero = source('./components/hero.tsx');
  assert.ok(hero.includes('<KpiTiles') && hero.includes('t.hero.asOf'));
  assert.ok(!hero.includes('<OverallBar totals'));
  const kpis = source('./components/insights/kpis.tsx');
  assert.match(
    page,
    /renderLead\(view\)[\s\S]+<RoadmapTabs[\s\S]+panels=\{panels\}/
  );
  assert.match(
    kpis,
    /commitCount !== undefined\s*\?\s*\{\s*id: 'commits',[\s\S]+?\}\s*:\s*\{\s*id: 'merged'/
  );
  assert.deepEqual(
    [...kpis.matchAll(/^ {6}id: '([^']+)'/gm)].map(([, id]) => id),
    ['live', 'waiting']
  );
});
test('a hidden tab panel never docks the navbar or loses the timeline scrubber position', () => {
  const tracks = source('./components/tracks.tsx');
  const guarded = (s: string) =>
    /el\.getClientRects\(\)\.length > 0 &&\s*el\.getBoundingClientRect\(\)\.top < dockLine/.test(
      s
    ) && /new ResizeObserver\(schedule\)/.test(s);
  assert.ok(guarded(tracks));
  // Broken variant: a display:none sentinel reports top 0, which is above
  // the dock line, so the navbar would compact on every other tab.
  assert.ok(!guarded(tracks.replace('el.getClientRects().length > 0 &&', '')));
  const timeline = source('./components/timeline.tsx');
  assert.ok(
    /In a hidden tab panel: centre once the panel shows\./.test(timeline)
  );
  assert.ok(
    /if \(list\.clientWidth \|\| typeof ResizeObserver === 'undefined'\)/.test(
      timeline
    )
  );
});
test('the router location alone selects the tab; a click only navigates', () => {
  const tabs = source('./components/tabs.tsx');
  const derived = (s: string) =>
    s.includes('useRouterState({ select: (state) => state.location.hash })') &&
    s.includes(
      'const active = upgraded ? tabForFragment(hash, panelOf) : null;'
    ) &&
    !/useState<TabId|setActive|addEventListener\('hashchange'/.test(s);
  assert.ok(derived(tabs));
  // Broken variant: a click that also sets local state can drift from the
  // location (the router's own navigations fire no hashchange).
  assert.ok(
    !derived(
      tabs.replace(
        'const active = upgraded',
        'const [picked, setActive] = useState<TabId | null>(null);\n  const active = upgraded'
      )
    )
  );
  assert.ok(/event\.preventDefault\(\);\s*select\(tab, false\);/.test(tabs));
  assert.ok(/hashScrollIntoView: false,/.test(tabs));
  // Modified clicks (new tab, new window) keep the native link.
  assert.ok(/event\.metaKey \|\|\s*event\.ctrlKey/.test(tabs));
  // A fragment naming a section in a hidden panel scrolls to it once shown.
  assert.ok(
    /document\.getElementById\(id\)\?\.scrollIntoView\(\{ block: 'start' \}\)/.test(
      tabs
    )
  );
  // The skip target takes focus before hydration too.
  assert.match(tabs, /id="sections"\s*tabIndex=\{-1\}/);
});
test('the compact lead labels the rendered source in a fixed slot', () => {
  const hero = source('./components/hero.tsx');
  const css = readStyles();
  const line = (s: string) =>
    s.slice(
      s.indexOf('className="hero-asof"'),
      s.indexOf('</p>', s.indexOf('className="hero-asof"'))
    );
  /** Every label renders, stacked; only the current one shows. */
  const stable = (s: string, styles: string) =>
    /SHOWN_STATES\.map\(\(state\) =>/.test(line(s)) &&
    /\{t\.hero\.state\[state\]\}/.test(line(s)) &&
    /data-shown=\{state === shown \? '' : undefined\}/.test(line(s)) &&
    /<span className="sr-only">\{t\.liveCheckFailed\} <\/span>/.test(line(s)) &&
    /\.hero-asof-labels > span \{\s*grid-area: 1 \/ 1;\s*visibility: hidden;/.test(
      styles
    ) &&
    /\.hero-asof-labels > \[data-shown\] \{\s*visibility: visible;/.test(
      styles
    );
  assert.ok(stable(hero, css));
  assert.match(
    source('./components/live-label.ts'),
    /export const SHOWN_STATES = \['snapshot', 'live', 'failed'\] as const;/
  );
  assert.match(
    source('./pages/roadmap.tsx'),
    /shown=\{shownState\('snapshot', data\.source\)\}/
  );
  const pulse = source('../../../apps/roadmap/src/pulse/pulse-hero.tsx');
  assert.match(
    pulse,
    /snapshot\?\.productionSha \? \([\s\S]+?\{copy\.production\}[\s\S]+?\{copy\.productionUnknown\}/
  );
  assert.match(
    pulse,
    /snapshot && !sampled && <span>\{copy\.snapshot\}<\/span>/
  );
  assert.match(pulse, /dateTime=\{snapshot\.generatedAt\}/);
  for (const t of [en, vi])
    assert.ok(
      t.hero.state.snapshot && t.hero.state.live && t.hero.state.failed
    );
  assert.notEqual(en.hero.state.failed, vi.hero.state.failed);
  // Broken variants: rendering only the current label (the slot's width
  // follows the text, so the line wraps differently on a phone when the
  // check fails), and hiding the label with display: none (same effect).
  assert.ok(
    !stable(
      hero.replace('SHOWN_STATES.map((state) =>', '[shown].map((state) =>'),
      css
    )
  );
  assert.ok(
    !stable(
      hero,
      css.replace(
        /(\.hero-asof-labels > span \{\s*grid-area: 1 \/ 1;\s*)visibility: hidden;/,
        '$1display: none;'
      )
    )
  );
  assert.match(
    source('./components/chrome.tsx'),
    /\{liveCheckFailed \? <p>\{t\.liveCheckFailed\}<\/p> : null\}/
  );
});
test('deliverables shipped this week lead the Activity tab', () => {
  const kpis = source('./components/insights/kpis.tsx');
  const tile = kpis.slice(kpis.indexOf('export function ShippedTile'));
  assert.ok(tile.includes('label: t.stats.shippedWeek'));
  assert.ok(tile.includes('<Delta value={shipped} t={t} lang={lang} />'));
  assert.ok(tile.includes('const { shipped } = insights.tiles;'));
  const page = source('./pages/roadmap.tsx');
  const activity = page.slice(page.indexOf('\n    activity: ('));
  assert.ok(
    activity.indexOf('<ShippedTile') >= 0 &&
      activity.indexOf('<ShippedTile') < activity.indexOf('<PulseSection')
  );
  assert.doesNotMatch(kpis, /weekly shipped flow lives in the shipping pulse/);
});
test('the skip link focuses the selected tab and leaves the fragment alone', () => {
  const tabs = source('./components/tabs.tsx');
  const skip = tabs.slice(tabs.indexOf('export function skipToTabs'));
  const keeps = (s: string) =>
    /if \(!tab\) return;\s*event\.preventDefault\(\);\s*tab\.focus\(\);/.test(
      s
    );
  assert.ok(keeps(skip));
  // Broken variant: following #sections would select Overview (it names
  // no panel), so a reader on Progress would lose their tab.
  assert.ok(!keeps(skip.replace('event.preventDefault();', '')));
  assert.match(
    source('./pages/roadmap.tsx'),
    /<a className="skip-link" href="#sections" onClick=\{skipToTabs\}>/
  );
});
