import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { describe, expect, it } from 'vitest';
import {
  isSupportedTimezone,
  loadTaggedTimeStats,
  MAX_TAGGED_STATS_PAGES,
} from './tagged-stats-query';

function fakeClient(
  pages: { start_time: string; duration_seconds: number }[][]
) {
  const filters: string[] = [];
  let page = 0;
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'contains', 'not', 'gte', 'order']) {
    builder[method] = (...args: unknown[]) => {
      filters.push(`${method}:${JSON.stringify(args)}`);
      return builder;
    };
  }
  builder.range = async () => ({ data: pages[page++] ?? [], error: null });
  const client = { from: () => builder } as unknown as TypedSupabaseClient;
  return { client, filters };
}

const now = new Date('2026-10-28T02:00:00Z');

describe('loadTaggedTimeStats', () => {
  it('filters by user, tag and workspace, then computes stats', async () => {
    const { client, filters } = fakeClient([
      [{ start_time: '2026-10-28T01:00:00Z', duration_seconds: 1500 }],
    ]);

    const stats = await loadTaggedTimeStats(client, {
      userId: 'u1',
      wsId: 'ws1',
      isPersonal: false,
      timezone: 'Asia/Ho_Chi_Minh',
      tag: 'pomodoro',
      daysBack: 7,
      now,
    });

    expect(stats.todayTime).toBe(1500);
    expect(filters).toContain('eq:["user_id","u1"]');
    expect(filters).toContain('contains:["tags",["pomodoro"]]');
    expect(filters).toContain('eq:["ws_id","ws1"]');
  });

  it('spans workspaces for personal stats and reads every page', async () => {
    const full = Array.from({ length: 1000 }, () => ({
      start_time: '2026-10-27T03:00:00Z',
      duration_seconds: 60,
    }));
    const { client, filters } = fakeClient([
      full,
      [{ start_time: '2026-10-28T01:00:00Z', duration_seconds: 60 }],
    ]);

    const stats = await loadTaggedTimeStats(client, {
      userId: 'u1',
      wsId: 'ws1',
      isPersonal: true,
      timezone: 'UTC',
      tag: 'pomodoro',
      daysBack: 7,
      now,
    });

    expect(stats.weekTime).toBe(1001 * 60);
    expect(filters.some((f) => f.startsWith('eq:["ws_id"'))).toBe(false);
  });

  it('flags stats as truncated when every page is full', async () => {
    const full = Array.from({ length: 1000 }, () => ({
      start_time: '2026-10-27T03:00:00Z',
      duration_seconds: 60,
    }));
    const { client } = fakeClient(Array.from({ length: 11 }, () => full));
    const options = {
      userId: 'u1',
      wsId: 'ws1',
      isPersonal: true,
      timezone: 'UTC',
      tag: 'pomodoro',
      daysBack: 7,
      now,
    };

    const capped = await loadTaggedTimeStats(client, options);
    expect(capped.truncated).toBe(true);
    expect(capped.weekTime).toBe(MAX_TAGGED_STATS_PAGES * 1000 * 60);

    const { client: small } = fakeClient([full.slice(0, 3)]);
    expect((await loadTaggedTimeStats(small, options)).truncated).toBe(false);
  });

  it('recognizes supported timezones', () => {
    expect(isSupportedTimezone('Asia/Ho_Chi_Minh')).toBe(true);
    expect(isSupportedTimezone('Not/AZone')).toBe(false);
  });
});
