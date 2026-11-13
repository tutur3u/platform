/** D79: pulse metrics, production updates, patch notes and chart contracts. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { History } from '../history/build.ts';
import {
  activityForBuild,
  MISSING_ACTIVITY,
  mergedWindow,
  offlineActivity,
  parseActivity,
  type ActivitySnapshot,
} from './activity.ts';
import { axisRank, nextIndex, niceMax } from './chart-nav.ts';
import { allMerged, buildPulse } from './pulse-model.ts';
import { productionUpdates, timeToLive, waitingAge } from './production.ts';
import { change, dayKeys, movingAverage, quantile, RANGES } from './series.ts';
import type { TrackedPr } from './tracked.ts';
import { trackedPrs } from './tracked.ts';
import { weeklyTiles } from './weekly.ts';
import { readLastVisit, rememberVisit, sinceIndex } from './last-visit.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-13T05:00:00Z'); // 12:00 in Vietnam
const TODAY = '2026-11-13';
const SHA = (n: number) => String(n).padStart(40, 'a');

const tracked = (
  number: number,
  mergedAt: string,
  app: string | null = 'tasks',
  inProd: boolean | null = true,
  trackId = 'tasks'
): TrackedPr => ({
  number,
  mergedAt,
  day: new Date(Date.parse(mergedAt) + 7 * HOUR).toISOString().slice(0, 10),
  trackId,
  app,
  deliverable: `Deliverable ${number}`,
  inProd,
});

function activity(
  entries: [number, string, number][],
  from = '2026-10-25',
  to = TODAY
): ActivitySnapshot {
  return {
    schema: 1,
    checkedAt: new Date(NOW).toISOString(),
    mode: 'observed',
    deploys: [],
    merged: {
      from,
      to,
      complete: true,
      tracks: ['tasks', 'mira', 'other'],
      entries,
    },
  };
}

describe('series: deltas and moving average', () => {
  it('averages a full trailing window only', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.deepEqual(movingAverage(values, 7), [
      null,
      null,
      null,
      null,
      null,
      null,
      4,
      5,
    ]);
  });

  it('broken variant: a missing day never averages as zero', () => {
    const ma = movingAverage([7, 7, 7, null, 7, 7, 7, 7], 7);
    assert.deepEqual(ma.slice(6), [null, null]);
  });

  it('reports direction, absolute and relative change', () => {
    assert.deepEqual(change(15, 10), {
      current: 15,
      previous: 10,
      delta: 5,
      pct: 0.5,
      direction: 'up',
    });
    assert.equal(change(5, 10).direction, 'down');
    assert.equal(change(5, 10).pct, -0.5);
    assert.equal(change(3, 3).direction, 'flat');
    // Broken variant: growth from zero has no percentage, never Infinity.
    assert.equal(change(4, 0).pct, null);
  });

  it('computes week-over-week flows for the tiles', () => {
    const item = (status: string, shippedAt: string | null) => ({
      state: { status, shippedAt },
    });
    const items = [
      item('live', '2026-11-12T01:00:00Z'),
      item('waiting_for_prod_sync', '2026-11-11T01:00:00Z'),
      item('waiting_for_prod_sync', '2026-11-12T03:00:00Z'),
      item('live', '2026-11-04T01:00:00Z'),
      item('planned', null),
    ] as Parameters<typeof weeklyTiles>[0]['items'];
    const tiles = weeklyTiles({
      items,
      totals: {
        live: 2,
        waiting_for_prod_sync: 2,
        waiting_for_merge: 0,
        in_progress: 0,
        planned: 1,
      },
      tracked: [
        tracked(1, '2026-11-12T01:00:00Z'),
        tracked(2, '2026-11-03T01:00:00Z'),
      ],
      all: allMerged(
        activity([
          [10, '2026-11-12', 0],
          [11, '2026-11-05', 1],
          [12, '2026-11-04', 1],
        ]),
        null
      ),
      today: TODAY,
      now: NOW,
    });
    assert.deepEqual([tiles.shipped.current, tiles.shipped.previous], [3, 1]);
    assert.deepEqual(
      [tiles.live.added.current, tiles.live.added.previous],
      [1, 1]
    );
    assert.equal(tiles.waiting.added.current, 2);
    assert.deepEqual([tiles.merged?.current, tiles.merged?.previous], [1, 2]);
    assert.deepEqual(
      [tiles.trackedMerged.current, tiles.trackedMerged.previous],
      [1, 1]
    );
  });

  it('broken variant: an unobserved week has no all-PR delta', () => {
    const tiles = weeklyTiles({
      items: [],
      totals: {
        live: 0,
        waiting_for_prod_sync: 0,
        waiting_for_merge: 0,
        in_progress: 0,
        planned: 0,
      },
      tracked: [],
      all: allMerged(MISSING_ACTIVITY, null),
      today: TODAY,
      now: NOW,
    });
    assert.equal(tiles.merged, null);
  });
});

describe('range switcher', () => {
  const all = allMerged(
    activity([
      [1, '2026-11-13', 0],
      [2, '2026-11-13', 1],
      [3, '2026-11-10', 2],
      [4, '2026-11-03', 0],
    ]),
    null
  );
  it('offers 7, 14, 30 and 90 days', () => {
    assert.deepEqual([...RANGES], [7, 14, 30, 90]);
  });

  for (const range of RANGES)
    it(`renders exactly ${range} days ending today`, () => {
      const pulse = buildPulse({
        tracked: [],
        all,
        deploys: [],
        today: TODAY,
        range,
      });
      assert.equal(pulse.points.length, range);
      assert.equal(pulse.points.at(-1)?.day, TODAY);
      assert.deepEqual(
        pulse.points.map((p) => p.day),
        dayKeys(TODAY, range)
      );
    });

  it('counts all PRs, tracked PRs, production and products per day', () => {
    const pulse = buildPulse({
      tracked: [
        tracked(1, '2026-11-13T01:00:00Z', 'tasks', true),
        tracked(9, '2026-11-13T02:00:00Z', 'tasks', false),
      ],
      all,
      deploys: [
        { app: 'tasks', commit: SHA(1), builtAt: '2026-11-13T03:00:00Z' },
      ],
      today: TODAY,
      range: 7,
    });
    const today = pulse.points.at(-1);
    assert.deepEqual(
      {
        all: today?.all,
        tracked: today?.tracked,
        inProd: today?.inProd,
        deploys: today?.deploys,
        products: today?.products,
      },
      { all: 2, tracked: 2, inProd: 1, deploys: 1, products: ['mira', 'tasks'] }
    );
    assert.equal(pulse.primary, 'all');
    assert.equal(pulse.totals.all, 3);
    // 7 days before: 3 Nov had one merge.
    assert.deepEqual(
      [pulse.allChange?.current, pulse.allChange?.previous],
      [3, 1]
    );
  });

  it('broken variant: days nobody observed are unknown, not zero', () => {
    const pulse = buildPulse({
      tracked: [],
      all,
      deploys: [],
      today: TODAY,
      range: 30,
    });
    assert.equal(pulse.points[0]?.all, null);
    assert.equal(pulse.allComplete, false);
    assert.equal(pulse.allChange, null);
  });

  it('the lazily loaded history extends a long range', () => {
    const history = {
      schema: 1,
      generatedAt: '2026-11-02T10:00:00Z',
      tracks: ['tasks', 'other'],
      entries: [
        [50, '2026-10-20', 0, 0, null],
        [51, '2026-11-02', 0, 0, null],
      ],
      aggregates: { week: [], month: [], year: [] },
    } as unknown as History;
    const window = activity([[1, '2026-11-13', 0]], '2026-11-03');
    const without = buildPulse({
      tracked: [],
      all: allMerged(window, null),
      deploys: [],
      today: TODAY,
      range: 30,
    });
    assert.equal(without.points.find((p) => p.day === '2026-10-20')?.all, null);
    const pulse = buildPulse({
      tracked: [],
      all: allMerged(window, history),
      deploys: [],
      today: TODAY,
      range: 30,
    });
    assert.equal(pulse.points.find((p) => p.day === '2026-10-20')?.all, 1);
    // The history's own last day may be partial: unknown, not a low count.
    assert.equal(pulse.points.find((p) => p.day === '2026-11-02')?.all, null);
    assert.equal(pulse.points.find((p) => p.day === '2026-11-03')?.all, 0);
  });
});

describe('time to live', () => {
  const hosts = [
    {
      app: 'tasks',
      platform: 'workers' as const,
      commit: SHA(1),
      commitAt: '2026-11-12T10:00:00Z',
      behindBy: 0,
    },
  ];
  const deploys = [
    { app: 'tasks', commit: SHA(1), builtAt: '2026-11-12T12:00:00Z' },
  ];
  const prs = [
    tracked(1, '2026-11-12T10:00:00Z'), // 2 h before the build
    tracked(2, '2026-11-12T08:00:00Z'), // 4 h
    tracked(3, '2026-11-11T12:00:00Z'), // 24 h
    tracked(4, '2026-11-12T11:00:00Z', 'tasks', false), // after the deployed commit
  ];

  it('takes the median and p90 from merge to the serving build', () => {
    const updates = productionUpdates(hosts, deploys, prs, NOW);
    const ttl = timeToLive(updates, NOW - 14 * DAY);
    assert.equal(ttl.count, 3);
    assert.equal(ttl.medianMs, 4 * HOUR);
    assert.equal(ttl.p90Ms, quantile([2 * HOUR, 4 * HOUR, 24 * HOUR], 0.9));
  });

  it('broken variant: no observed build time, no figure', () => {
    const updates = productionUpdates(hosts, [], prs, NOW);
    assert.equal(timeToLive(updates, 0).medianMs, null);
    // A build of another commit says nothing about this deploy.
    const other = productionUpdates(
      hosts,
      deploys.map((deploy) => ({ ...deploy, commit: SHA(2) })),
      prs,
      NOW
    );
    assert.equal(timeToLive(other, 0).count, 0);
  });

  it('measures how long waiting work has waited', () => {
    const age = waitingAge(prs, NOW);
    assert.equal(age.count, 1);
    assert.equal(age.medianMs, NOW - Date.parse('2026-11-12T11:00:00Z'));
  });
});

describe('recent production updates', () => {
  const hosts = [
    {
      app: 'tasks',
      platform: 'workers' as const,
      commit: SHA(1),
      commitAt: '2026-11-12T10:00:00Z',
      behindBy: 3,
    },
    {
      app: 'chat',
      platform: 'vercel' as const,
      commit: SHA(2),
      commitAt: '2026-11-10T10:00:00Z',
      behindBy: 9,
    },
    {
      app: 'mail',
      platform: 'unknown' as const,
      commit: null,
      commitAt: null,
      behindBy: null,
    },
  ];
  const deploys = [
    { app: 'tasks', commit: SHA(1), builtAt: '2026-11-12T12:00:00Z' },
    { app: 'chat', commit: SHA(2), builtAt: '2026-11-13T01:00:00Z' },
  ];
  const prs = [
    tracked(1, '2026-11-12T09:00:00Z', 'tasks'),
    tracked(2, '2026-11-12T11:00:00Z', 'tasks', false),
    tracked(3, '2026-11-09T09:00:00Z', 'chat'),
    tracked(4, '2026-11-12T09:00:00Z', 'mail', null),
  ];
  const updates = productionUpdates(hosts, deploys, prs, NOW);

  it('lists builds newest first with the work each runs', () => {
    assert.deepEqual(
      updates.map((u) => u.app),
      ['chat', 'tasks']
    );
    assert.deepEqual(
      updates[1]?.live.map((pr) => pr.number),
      [1]
    );
    assert.equal(updates[0]?.builtAt, '2026-11-13T01:00:00Z');
  });

  it('broken variant: a PR merged after the deployed commit is never live', () => {
    const tasks = updates.find((u) => u.app === 'tasks');
    assert.ok(!tasks?.live.some((pr) => pr.number === 2));
    assert.deepEqual(
      tasks?.waiting.map((pr) => pr.number),
      [2]
    );
    // An app whose deploy cannot be observed lists nothing.
    assert.ok(!updates.some((u) => u.app === 'mail'));
  });

  it('uses the same inclusion rule as the Live status', () => {
    const items = [
      {
        title: 'Live item',
        app: 'tasks',
        trackId: 'tasks',
        state: {
          status: 'live' as const,
          shippedAt: '2026-11-12T09:00:00Z',
          unverifiedDeploy: false,
          prs: [
            {
              number: 1,
              title: 'x',
              state: 'merged' as const,
              draft: false,
              approved: true,
              mergedAt: '2026-11-12T09:00:00Z',
            },
          ],
        },
      },
      {
        title: 'Waiting item',
        app: 'tasks',
        trackId: 'tasks',
        state: {
          status: 'waiting_for_prod_sync' as const,
          shippedAt: '2026-11-12T11:00:00Z',
          unverifiedDeploy: false,
          prs: [
            {
              number: 2,
              title: 'y',
              state: 'merged' as const,
              draft: false,
              approved: true,
              mergedAt: '2026-11-12T11:00:00Z',
            },
          ],
        },
      },
    ];
    const derived = trackedPrs(items, hosts);
    assert.deepEqual(
      derived.map((pr) => [pr.number, pr.inProd]),
      [
        [2, false],
        [1, true],
      ]
    );
  });

  it('marks what is new since the last visit, and survives blocked storage', () => {
    const times = updates.map((u) => u.at);
    assert.equal(sinceIndex(times, Date.parse('2026-11-12T20:00:00Z')), 1);
    assert.equal(sinceIndex(times, null), null);
    assert.equal(sinceIndex(times, 0), times.length); // all new
    assert.equal(sinceIndex(times, NOW), 0); // nothing new
    const throwing = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    assert.equal(readLastVisit(throwing), null);
    assert.doesNotThrow(() => rememberVisit(NOW, throwing));
    const store = new Map<string, string>();
    const memory = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    rememberVisit(NOW, memory);
    assert.equal(readLastVisit(memory), NOW);
  });
});

describe('build activity', () => {
  it('keeps only a valid, fresh snapshot', () => {
    const snapshot = activity([[1, TODAY, 0]]);
    assert.deepEqual(parseActivity(snapshot), snapshot);
    assert.equal(activityForBuild(snapshot, NOW + 10 * 60_000), snapshot);
    // Broken variants: stale, malformed, offline.
    assert.equal(activityForBuild(snapshot, NOW + 2 * HOUR), null);
    assert.equal(parseActivity({ ...snapshot, schema: 2 }).mode, 'missing');
    assert.equal(
      parseActivity({
        ...snapshot,
        merged: { ...snapshot.merged, entries: [[1, TODAY, 9]] },
      }).merged,
      null
    );
    const offline = parseActivity(offlineActivity(NOW));
    assert.equal(offline.mode, 'offline');
    assert.equal(offline.merged, null);
    assert.deepEqual(offline.deploys, []);
  });

  it('builds the merged window without noise and from the first full day', () => {
    const window = mergedWindow(
      [
        {
          number: 1,
          title: 'feat(tasks): board',
          mergedAt: '2026-11-13T01:00:00Z',
        },
        {
          number: 2,
          title: 'chore(deps): bump x',
          mergedAt: '2026-11-12T01:00:00Z',
        },
        { number: 3, title: 'fix(chat): y', mergedAt: '2026-10-30T02:00:00Z' }, // 09:00 VN on the partial day
        { number: 4, title: 'feat(mira): z', mergedAt: null },
      ],
      {
        searchSince: '2026-10-30',
        now: NOW,
        complete: true,
        trackIds: ['tasks', 'chat'],
        isNoise: (title) => title.includes('(deps)'),
        classify: (title) => ({
          track: title.includes('tasks') ? 'tasks' : 'other',
        }),
        localDay: (iso) =>
          new Date(Date.parse(iso) + 7 * HOUR).toISOString().slice(0, 10),
      }
    );
    assert.equal(window.from, '2026-10-31');
    assert.deepEqual(window.entries, [[1, TODAY, 0]]);
  });
});

describe('patch notes', async () => {
  const { parseChangelog } = await import('../changelog/schema.ts');
  const { changelogForBuild, readChangelog } =
    await import('../changelog/embed.ts');
  const fixture = JSON.parse(
    readFileSync(
      new URL('../changelog/fixtures/changelog.json', import.meta.url),
      'utf8'
    )
  );

  it('embeds a valid changelog, newest release first', () => {
    const changelog = changelogForBuild(fixture);
    assert.ok(changelog);
    assert.deepEqual(
      changelog.releases.map((r) => r.date),
      ['2026-11-12', '2026-11-10']
    );
  });

  it('broken variant: missing or invalid changelog hides the section', () => {
    assert.equal(readChangelog(null), null);
    assert.equal(readChangelog(undefined), null);
    assert.equal(readChangelog({ ...fixture, schema: 2 }), null);
    assert.equal(readChangelog({ ...fixture, releases: [{ id: 'x' }] }), null);
    assert.equal(readChangelog({ ...fixture, releases: [] }), null);
    assert.equal(parseChangelog('{"schema":1}'), null);
    const notes = readFileSync(
      new URL('../components/insights/patch-notes.tsx', import.meta.url),
      'utf8'
    );
    assert.match(notes, /if \(!changelog\?\.releases\.length\) return null;/);
    const page = readFileSync(
      new URL('../pages/roadmap.tsx', import.meta.url),
      'utf8'
    );
    assert.match(
      page,
      /<PatchNotes t=\{t\} lang=\{lang\} changelog=\{BUILD_CHANGELOG\} \/>/
    );
  });

  it('renders text as plain text and builds PR links from numbers', () => {
    const notes = readFileSync(
      new URL('../components/insights/patch-notes.tsx', import.meta.url),
      'utf8'
    );
    assert.ok(!notes.includes('dangerouslySetInnerHTML'));
    assert.match(notes, /href=\{`\$\{REPO_URL\}\/pull\/\$\{number\}`\}/);
    const embed = readFileSync(
      new URL('../changelog/embed.ts', import.meta.url),
      'utf8'
    );
    assert.match(embed, /from '\.\/schema\.ts'/);
  });
});

describe('chart keyboard navigation', () => {
  it('moves with arrows, Home, End and page keys, clamped', () => {
    assert.equal(nextIndex('ArrowRight', 3, 14), 4);
    assert.equal(nextIndex('ArrowLeft', 3, 14), 2);
    assert.equal(nextIndex('ArrowLeft', 0, 14), 0);
    assert.equal(nextIndex('ArrowRight', 13, 14), 13);
    assert.equal(nextIndex('Home', 9, 14), 0);
    assert.equal(nextIndex('End', 2, 14), 13);
    assert.equal(nextIndex('PageUp', 10, 14), 13);
    assert.equal(nextIndex('PageDown', 3, 14), 0);
    // Broken variant: other keys (Tab) leave the chart to the browser.
    assert.equal(nextIndex('Tab', 3, 14), null);
    assert.equal(nextIndex('a', 3, 14), null);
  });

  it('uses a roving tabindex, a polite live region and a data table', () => {
    const chart = readFileSync(
      new URL('../components/insights/pulse-chart.tsx', import.meta.url),
      'utf8'
    );
    assert.match(chart, /tabIndex=\{index === roving \? 0 : -1\}/);
    assert.match(chart, /role="status" aria-live="polite"/);
    assert.match(chart, /<table className="sr-only">/);
    assert.match(chart, /onPointerMove=\{onPointerMove\}/);
    assert.ok(!chart.includes('<details'), 'no "show the numbers" disclosure');
  });

  it('labels the axis without crowding', () => {
    assert.equal(axisRank(0, 14, 2), 0);
    assert.equal(axisRank(13, 14, 2), 0);
    assert.equal(axisRank(12, 14, 2), null); // would touch "Today"
    assert.equal(axisRank(2, 14, 2), 1);
    assert.equal(niceMax(3), 4);
    assert.equal(niceMax(37), 50);
    assert.equal(niceMax(120), 200);
  });
});

/**
 * Whether the stylesheet keeps the hero and anchors clear of the fixed
 * navbar: page-level scroll padding at least the navbar's height, a scroll
 * margin on targets that follows the live offset, and a hero top padding
 * that grows with it.
 */
export function heroClearsNavbar(css: string, navOffset: number) {
  const padding =
    /html:has\(\.roadmap\)\s*\{[^}]*scroll-padding-top:\s*(\d+)px/.exec(css);
  const margin =
    /\.roadmap :is\(h1, h2, h3\)\[id\],\s*\.roadmap section\[id\]\s*\{[^}]*scroll-margin-top:\s*calc\(var\(--shell-nav-offset, 76px\) \+ \d+px\)/.test(
      css
    );
  const hero =
    /\.roadmap \.hero\s*\{[^}]*padding-top:\s*max\(\d+px, calc\(var\(--shell-nav-offset, 76px\)/.test(
      css
    );
  return Boolean(
    padding && Number(padding[1]) >= navOffset + 16 && margin && hero
  );
}

describe('hero and navbar offset (CSS contract)', async () => {
  const { shellNavOffset } =
    await import('../../../../packages/marketing-shell/src/nav-metrics.ts');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

  it('clears the navbar at every width and for every anchor', () => {
    assert.ok(heroClearsNavbar(css, shellNavOffset(false)));
    // The shell offsets #main-content by pt-20 (80px); with the hero's
    // minimum padding the eyebrow starts well below the full navbar.
    const shell = readFileSync(
      new URL(
        '../../../../packages/marketing-shell/src/marketing-shell.tsx',
        import.meta.url
      ),
      'utf8'
    );
    assert.match(shell, /id="main-content"/);
    assert.match(shell, /pt-20/);
    assert.ok(80 + 48 >= shellNavOffset(false) + 32);
  });

  it('broken variant: top-0 anchors and a fixed hero padding fail', () => {
    const broken = css
      .replace(/scroll-padding-top:\s*\d+px/, 'scroll-padding-top: 0px')
      .replace(
        /padding-top: max\(48px, calc\(var\(--shell-nav-offset, 76px\) - 24px\)\)/,
        'padding-top: 0'
      );
    assert.equal(heroClearsNavbar(broken, shellNavOffset(false)), false);
  });
});
