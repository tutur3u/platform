/** Commits-flow pulse and weekly tiles. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildCommitPulse, commitTiles } from './commit-pulse.ts';
import type { CommitWindow } from './commits.ts';

const WINDOW: CommitWindow = {
  from: '2026-11-01',
  to: '2026-11-17',
  tracks: ['calendar', 'meet', 'other'],
  days: [
    ['2026-11-17', 10, 0, 0],
    ['2026-11-16', 20, 2, 12],
    ['2026-11-12', 6, 6, 6],
    ['2026-11-10', 8, 8, 8],
    ['2026-11-04', 4, 4, 4],
  ],
  products: [
    ['2026-11-17', 0, 6],
    ['2026-11-17', 2, 4],
    ['2026-11-16', 1, 20],
    ['2026-11-10', 0, 8],
  ],
  production: {
    commit: 'a'.repeat(40),
    waiting: 18,
    oldestWaitingAt: '2026-11-16T05:00:00.000Z',
  },
};

describe('commit pulse', () => {
  const pulse = buildCommitPulse({
    commits: WINDOW,
    today: '2026-11-17',
    range: 7,
  });

  it('stacks in production under waiting, with zero on quiet days', () => {
    assert.equal(pulse.points.length, 7);
    const today = pulse.points.at(-1);
    assert.deepEqual(
      [today?.all, today?.tracked, today?.inProd, today?.viaPr],
      [10, 10, 0, 0]
    );
    const quiet = pulse.points.find((point) => point.day === '2026-11-13');
    assert.deepEqual([quiet?.all, quiet?.inProd], [0, 0]);
    assert.deepEqual(pulse.points.at(-2)?.products, ['meet']);
  });

  it('totals the range, compares with the covered range before it', () => {
    assert.deepEqual(pulse.totals, { total: 36, viaPr: 8, inProd: 18 });
    assert.equal(pulse.complete, true);
    assert.equal(pulse.totalChange?.previous, 12);
    assert.equal(pulse.totalChange?.direction, 'up');
    assert.deepEqual(pulse.products, [
      { track: 'meet', count: 20 },
      { track: 'calendar', count: 6 },
      { track: 'other', count: 4 },
    ]);
  });

  it('reads days outside the window as unknown, never zero', () => {
    const wide = buildCommitPulse({
      commits: WINDOW,
      today: '2026-11-17',
      range: 30,
    });
    assert.equal(wide.complete, false);
    assert.equal(wide.totalChange, null);
    assert.equal(wide.points[0]?.all, null);
    assert.deepEqual(wide.totals, { total: 48, viaPr: 20, inProd: 30 });
  });
});

describe('commit tiles', () => {
  const now = Date.parse('2026-11-17T06:00:00.000Z');
  const tiles = commitTiles({ commits: WINDOW, today: '2026-11-17', now });

  it('counts this week in commits, shipped as landed and in production', () => {
    assert.equal(tiles.shipped, 18);
    assert.equal(tiles.landed.current, 36);
    assert.equal(tiles.landed.change?.previous, 12);
    assert.deepEqual(tiles.direct, {
      direct: 28,
      viaPr: 8,
      share: 28 / 36,
    });
    assert.deepEqual(tiles.waiting, { count: 18, oldestMs: 25 * 3_600_000 });
  });

  it('leaves last week and the queue unknown when not observed', () => {
    const short = commitTiles({
      commits: { ...WINDOW, from: '2026-11-12', production: null },
      today: '2026-11-17',
      now,
    });
    assert.equal(short.landed.current, 36);
    assert.equal(short.landed.change, null);
    assert.equal(short.waiting, null);
  });
});

describe('a page built before today', () => {
  it('ends the figures on the build day instead of counting short', () => {
    const later = '2026-11-20';
    const pulse = buildCommitPulse({ commits: WINDOW, today: later, range: 7 });
    assert.equal(pulse.asOf, '2026-11-17');
    assert.equal(pulse.points.at(-1)?.day, '2026-11-17');
    assert.equal(pulse.complete, true);
    assert.deepEqual(pulse.totals, { total: 36, viaPr: 8, inProd: 18 });
    const tiles = commitTiles({
      commits: WINDOW,
      today: later,
      now: Date.parse('2026-11-20T06:00:00.000Z'),
    });
    assert.equal(tiles.asOf, '2026-11-17');
    assert.equal(tiles.landed.current, 36);
    assert.equal(tiles.shipped, 18);
  });
});

describe('commit messages', () => {
  it('ship every commits key in English and Vietnamese', () => {
    const read = (lang: string) =>
      JSON.parse(
        readFileSync(
          new URL(`../../messages/${lang}.json`, import.meta.url),
          'utf8'
        )
      ).commits as Record<string, string>;
    const en = read('en');
    const vi = read('vi');
    assert.deepEqual(Object.keys(vi).sort(), Object.keys(en).sort());
    for (const [key, value] of Object.entries(vi))
      assert.ok(
        value.trim() && (value !== en[key] || key === 'flowCommits'),
        key
      );
  });
});
