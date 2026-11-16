/** D79 tests for the v2 timeline (run via src/roadmap-data.test.ts). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { termHash } from '../live/feed.ts';
import { buildHistory, type History, parseHistory } from './build.ts';
import { classifyTitle, isNoise } from './classify.ts';
import {
  localDate,
  periodEnd,
  periodKey,
  periodRange,
  periodStart,
  shiftPeriod,
  views,
} from './periods.ts';
import {
  combineHistory,
  liveEntries,
  parseTimelineQuery,
  timelinePeriod,
  timelineSearch,
} from './timeline.ts';

describe('v2 history: classifier', () => {
  const known = new Set([
    'tasks',
    'calendar',
    'finance',
    'mira',
    'platform',
    'inventory',
    'other',
  ]);
  it('maps conventional scopes and legacy keywords to public tracks', () => {
    assert.deepEqual(
      classifyTitle('feat(tasks): plan sprints on the board (#7088)', known),
      {
        track: 'tasks',
        kind: 'feature',
        title: 'Plan sprints on the board',
      }
    );
    assert.deepEqual(classifyTitle('Add algorithmic auto-scheduling', known), {
      track: 'calendar',
      kind: 'feature',
      title: 'Add algorithmic auto-scheduling',
    });
    assert.equal(classifyTitle('Fix wallet totals', known).kind, 'fix');
    assert.equal(classifyTitle('Fix wallet totals', known).title, null);
    assert.equal(
      classifyTitle('feat(inventory): barcode scan for stock', known).title,
      'Barcode scan for stock'
    );
  });

  const broken = [
    'Add internal_email_api keys table and include authorization checks',
    'feat(tasks): patch XSS in the comment renderer',
    'feat(finance): customer-specific invoice preset',
    'Add incident banner after the outage',
    'feat(ci): seal the production artifact',
    'feat(tasks): add database schema for sprints',
    'chore(tasks): rename sprint store',
    'feat(unknown-scope): something new and shiny',
    'Add WIP quiz page',
  ];
  for (const title of broken)
    it(`broken variant never publishes: ${title}`, () => {
      assert.equal(classifyTitle(title, known).title, null);
    });

  it('drops bots and dependency churn; hashed client terms stay anonymous', () => {
    assert.ok(isNoise('Bump next from 15.0.0 to 15.0.1', null));
    assert.ok(isNoise('Anything', { type: 'Bot', login: 'renovate[bot]' }));
    assert.ok(isNoise('[ImgBot] Optimize images', null));
    assert.ok(!isNoise('Add task board', { type: 'User', login: 'someone' }));
    const hashes = new Set([termHash('Acme')]);
    assert.equal(
      classifyTitle('feat(tasks): Acme board presets', known, hashes).title,
      null
    );
  });
});

describe('v2 history: build, validate, periods', () => {
  const pulls = [
    {
      number: 3,
      title: 'Add prototype task board UI',
      mergedAt: '2022-10-20T03:00:00Z',
      author: null,
    },
    {
      number: 4,
      title: 'Fix sidebar',
      mergedAt: '2022-10-20T18:00:00Z',
      author: null,
    },
    {
      number: 5,
      title: 'Bump react',
      mergedAt: '2022-10-21T03:00:00Z',
      author: null,
    },
    {
      number: 6,
      title: 'feat(calendar): recurring events',
      mergedAt: '2026-11-09T17:30:00Z',
      author: null,
    },
  ];
  const history = buildHistory(
    pulls,
    ['tasks', 'calendar', 'platform'],
    '2026-11-10T00:00:00.000Z'
  );

  it('drops noise, dates in UTC+7 and aggregates every view', () => {
    assert.deepEqual(
      history.entries.map((e) => e[0]),
      [6, 4, 3]
    );
    assert.equal(history.entries[0][1], '2026-11-10');
    assert.equal(history.entries[1][1], '2022-10-21');
    for (const view of views)
      assert.equal(
        history.aggregates[view].reduce((sum, row) => sum + row[1], 0),
        history.entries.length
      );
    assert.deepEqual(
      history.aggregates.year.map((r) => r[0]),
      ['2022', '2026']
    );
    assert.deepEqual(
      parseHistory(JSON.parse(JSON.stringify(history))),
      history
    );
  });

  it('accepts the committed history asset', () => {
    const raw = JSON.parse(
      readFileSync(
        new URL('../generated/history.json', import.meta.url),
        'utf8'
      )
    );
    const parsed = parseHistory(raw);
    assert.ok(parsed.entries.length > 3000, 'full history back to 2022');
    assert.equal(parsed.entries.at(-1)?.[1].slice(0, 4), '2022');
    assert.ok(parsed.entries.every((e) => e[4] === null || e[3] === 0));
  });

  const brokenHistory: [string, (h: History) => unknown][] = [
    [
      'tampered aggregate',
      (h) => ({ ...h, aggregates: { ...h.aggregates, year: [] } }),
    ],
    [
      'title on a fix',
      (h) => ({
        ...h,
        entries: h.entries.map((e) =>
          e[0] === 4 ? [4, e[1], e[2], 1, 'Leaked'] : e
        ),
      }),
    ],
    [
      'duplicate entry',
      (h) => ({ ...h, entries: [...h.entries, h.entries[0]] }),
    ],
    [
      'unknown track index',
      (h) => ({
        ...h,
        entries: h.entries.map((e) => [e[0], e[1], 99, e[3], e[4]]),
      }),
    ],
    ['extra field', (h) => ({ ...h, raw: [] })],
  ];
  for (const [name, mutate] of brokenHistory)
    it(`broken variant rejected: ${name}`, () => {
      assert.throws(() =>
        parseHistory(JSON.parse(JSON.stringify(mutate(history))))
      );
    });

  it('periods follow ISO weeks and calendar months in Vietnam time', () => {
    assert.equal(periodKey('2026-11-10', 'week'), '2026-W46');
    assert.equal(periodKey('2021-01-03', 'week'), '2020-W53');
    assert.equal(periodStart('2026-W46', 'week'), '2026-11-09');
    assert.equal(periodEnd('2026-W46', 'week'), '2026-11-15');
    assert.equal(periodEnd('2024-02', 'month'), '2024-02-29');
    assert.equal(shiftPeriod('2026-W01', 'week', -1), '2025-W52');
    assert.equal(localDate('2026-11-09T17:30:00Z'), '2026-11-10');
    assert.equal(periodRange('2022-10-20', '2026-11-10', 'year').length, 5);
  });
});

describe('v2 timeline', () => {
  const history = buildHistory(
    [
      {
        number: 10,
        title: 'feat(tasks): sprint planning view',
        mergedAt: '2026-11-04T03:00:00Z',
        author: null,
      },
      {
        number: 11,
        title: 'feat(tasks): sprint summary',
        mergedAt: '2026-11-05T03:00:00Z',
        author: null,
      },
      {
        number: 12,
        title: 'fix(tasks): drag and drop',
        mergedAt: '2026-11-05T04:00:00Z',
        author: null,
      },
      {
        number: 13,
        title: 'chore: something internal',
        mergedAt: '2026-11-06T04:00:00Z',
        author: null,
      },
    ],
    ['tasks'],
    '2026-11-06T05:00:00.000Z'
  );
  const deliverable = {
    id: 'sprint-plan',
    title: 'Plan sprints',
    trackId: 'tasks',
    prs: [10],
    state: { status: 'live' as const, shippedAt: '2026-11-04T03:00:00.000Z' },
  };

  it('collapses a deliverable PR into the deliverable, once', () => {
    const period = timelinePeriod({
      history,
      deliverables: [deliverable],
      view: 'week',
      key: '2026-W45',
      today: '2026-11-10',
    });
    const tasks = period.groups.find((g) => g.track === 'tasks');
    assert.deepEqual(
      tasks?.deliverables.map((d) => d.id),
      ['sprint-plan']
    );
    assert.deepEqual(
      tasks?.features.map((f) => f.numbers),
      [[11]]
    );
    assert.equal(tasks?.fixes, 1);
    assert.equal(period.totals.total, 4);
    assert.equal(period.groups.at(-1)?.track, 'other');
    assert.equal(period.isCurrent, false);
  });

  it('merges live PRs merged after the build into the current period', () => {
    const extra = liveEntries(
      [
        {
          number: 20,
          title: 'feat(tasks): cycle view',
          state: 'merged',
          draft: false,
          approved: false,
          mergedAt: '2026-11-10T02:00:00.000Z',
        },
      ],
      history
    );
    const combined = combineHistory(history, extra);
    const period = timelinePeriod({
      history: combined,
      deliverables: [],
      view: 'week',
      key: '2026-W46',
      today: '2026-11-10',
    });
    assert.equal(period.isCurrent, true);
    assert.deepEqual(
      period.groups[0].features.map((f) => f.numbers),
      [[20]]
    );
    assert.equal(
      liveEntries(combined.entries.length ? [] : [], history).length,
      0
    );
  });

  it('parses shareable URL state and rejects broken variants', () => {
    assert.deepEqual(
      parseTimelineQuery('?view=month&period=2025-03', '2026-11-10'),
      { view: 'month', period: '2025-03' }
    );
    for (const search of [
      '?view=month&period=2030-01',
      '?view=month&period=2025-13',
      '?view=decade',
      '?view=week&period=2021-W53',
      '?view=month&period=2019-01',
    ])
      assert.equal(
        parseTimelineQuery(search, '2026-11-10').period,
        periodKey('2026-11-10', parseTimelineQuery(search, '2026-11-10').view)
      );
    assert.equal(timelineSearch('week', '2026-W46', '2026-11-10'), '');
    assert.equal(
      timelineSearch('year', '2023', '2026-11-10'),
      '?view=year&period=2023'
    );
  });
});

describe('v2 timeline: paired merges', () => {
  it('folds identical titles (dev/production pairs) into one row', () => {
    const history = buildHistory(
      [
        {
          number: 955,
          title: 'Add global navbar',
          mergedAt: '2023-03-01T03:00:00Z',
          author: null,
        },
        {
          number: 956,
          title: 'Add global navbar',
          mergedAt: '2023-03-01T04:00:00Z',
          author: null,
        },
      ],
      ['workspace'],
      '2023-03-02T00:00:00.000Z'
    );
    const period = timelinePeriod({
      history,
      deliverables: [],
      view: 'year',
      key: '2023',
      today: '2026-11-10',
    });
    assert.deepEqual(period.groups[0].features, [
      { numbers: [956, 955], title: 'Add global navbar', date: '2023-03-01' },
    ]);
    assert.equal(period.totals.total, 2);
  });
});
