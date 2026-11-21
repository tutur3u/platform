import { describe, expect, it } from 'vitest';
import {
  groupsOf,
  lastGoodCheck,
  pageKind,
  rowFreshness,
  shipStats,
  sourceMap,
} from './model';
import { NOW, snapshot, source } from './test-fixtures';

const row = (snap: ReturnType<typeof snapshot>, id: string, now = NOW) =>
  rowFreshness(
    snap.apps.find((app) => app.id === id)!,
    sourceMap(snap),
    now
  );

describe('ship freshness', () => {
  it('stamps every row: checked, partial, stale or unknown', () => {
    const live = snapshot();
    expect(row(live, 'web')).toMatchObject({
      kind: 'checked',
      okAt: '2026-11-22T10:00:00.000Z',
    });
    expect(row(live, 'pktm').kind).toBe('unknown');

    const partial = snapshot({
      sources: [
        source('github:tutur3u/platform'),
        source('github:upskii/platform'),
        source('cloudflare', { state: 'error', problem: 'http', okAt: null }),
      ],
    });
    expect(row(partial, 'web')).toMatchObject({
      kind: 'partial',
      tone: 'orange',
    });
    // Rows that never read Cloudflare stay checked.
    expect(row(partial, 'mobile').kind).toBe('checked');
    expect(pageKind(partial)).toBe('partial');

    // A failed source's old confirmation never ages the working ones.
    const longDown = snapshot({
      sources: [
        source('github:tutur3u/platform'),
        source('github:upskii/platform'),
        source('cloudflare', {
          state: 'error',
          okAt: '2026-11-22T08:00:00.000Z',
        }),
      ],
    });
    expect(row(longDown, 'web')).toMatchObject({
      kind: 'partial',
      okAt: '2026-11-22T10:00:00.000Z',
    });
    // A row whose only source just failed is Partial inside the window.
    const githubDown = snapshot({
      sources: [
        source('github:tutur3u/platform', { state: 'error' }),
        source('github:upskii/platform'),
        source('cloudflare'),
      ],
    });
    expect(row(githubDown, 'mobile').kind).toBe('partial');
    expect(row(githubDown, 'mobile', NOW + 6 * 60_000).kind).toBe('stale');

    // Past three collector slots a working source still reads as stale.
    expect(row(live, 'web', NOW + 6 * 60_000).kind).toBe('stale');
  });

  it('treats an all-failed snapshot as an error with the last good check', () => {
    const down = snapshot({
      sources: [
        source('github:tutur3u/platform', {
          state: 'backoff',
          okAt: '2026-11-22T09:38:00.000Z',
        }),
        source('github:upskii/platform', { state: 'error', okAt: null }),
        source('cloudflare', {
          state: 'error',
          okAt: '2026-11-22T09:30:00.000Z',
        }),
      ],
    });
    expect(pageKind(down)).toBe('error');
    expect(lastGoodCheck(down)).toBe('2026-11-22T09:38:00.000Z');
    expect(row(down, 'web').kind).toBe('stale');
    // Unconfigured sources alone are not an outage.
    expect(
      pageKind(
        snapshot({ sources: [source('cloudflare', { state: 'unconfigured' })] })
      )
    ).toBe('live');
  });
});

describe('ship summary', () => {
  it('counts live apps, the release gap and CI failing on a live SHA', () => {
    const stats = shipStats(snapshot(), NOW);
    expect(stats).toMatchObject({
      live: 4,
      total: 6,
      waiting: 14,
      capped: false,
    });
    expect(stats.oldest?.app.id).toBe('web');
    expect(stats.failing.map((app) => app.id)).toEqual(['calendar']);
    expect(stats.doubtful.map((app) => app.id)).toEqual(['pktm']);
  });

  it('groups apps by product in display order', () => {
    expect(
      groupsOf(snapshot()).map((group) => [
        group.id,
        group.apps.length,
        group.live,
      ])
    ).toEqual([
      ['platform', 3, 2],
      ['mobile', 1, 1],
      ['upskii', 1, 1],
      ['pktm', 1, 0],
    ]);
  });
});
