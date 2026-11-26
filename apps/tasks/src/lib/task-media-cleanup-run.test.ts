import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  referenced: new Set<string>(),
  removed: [] as string[],
  onRemove: null as ((path: string) => void) | null,
}));

vi.mock('./task-media-cleanup', async (actual) => ({
  ...(await actual<typeof import('./task-media-cleanup')>()),
  removeUnreferencedTaskMedia: vi.fn(
    async (_admin: unknown, path: string, options?: { dryRun?: boolean }) => {
      if (mocks.referenced.has(path)) return false;
      if (!options?.dryRun) {
        mocks.removed.push(path);
        mocks.onRemove?.(path);
      }
      return true;
    }
  ),
}));

import {
  runTaskMediaCleanup,
  TASK_MEDIA_CLEANUP_LIMITS,
  taskMediaCleanupMode,
} from './task-media-cleanup-run';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-26T03:17:00Z');
const OLD = new Date(NOW - 40 * DAY).toISOString();
const NEW = new Date(NOW - 1 * DAY).toISOString();
const ws = (n: number) =>
  `${String(n).padStart(8, '0')}-2222-4222-8222-222222222222`;
const media = (n: number) =>
  `1700000000000_aaaaaaaa-bbbb-4ccc-8ddd-${String(n).padStart(12, '0')}_f.png`;

/** A storage bucket: workspaces → `task-images` → files. */
type ListOptions = { limit: number; offset: number };
type ListResult = {
  data: { id: string | null; name: string; created_at?: string }[] | null;
  error: Error | null;
};

function bucket(files: Record<string, { name: string; created_at: string }[]>) {
  const list = vi.fn(
    async (
      prefix: string,
      { limit, offset }: ListOptions
    ): Promise<ListResult> => {
      const all =
        prefix === ''
          ? Object.keys(files).map((name) => ({ id: null, name }))
          : (files[prefix.replace(/\/task-images$/u, '')] ?? []).map((f) => ({
              id: `id-${f.name}`,
              ...f,
            }));
      return { data: all.slice(offset, offset + limit), error: null };
    }
  );
  const admin = {
    storage: { from: () => ({ list }) },
  } as unknown as TypedSupabaseClient;
  return { admin, list };
}

const old = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => ({
    name: media(from + i),
    created_at: OLD,
  }));

beforeEach(() => {
  mocks.onRemove = null;
  mocks.referenced.clear();
  mocks.removed.length = 0;
});

describe('task media cleanup mode', () => {
  it.each([
    ['delete', 'delete'],
    ['off', 'off'],
    [undefined, 'dry-run'],
    ['', 'dry-run'],
    ['Delete', 'dry-run'],
    ['delete ', 'dry-run'],
  ])('%j → %s', (value, mode) => {
    expect(taskMediaCleanupMode(value)).toBe(mode);
  });
});

describe('runTaskMediaCleanup', () => {
  it('removes only old unreferenced media and is idempotent', async () => {
    const files = {
      [ws(1)]: [
        ...old(2),
        { name: media(9), created_at: NEW },
        { name: 'not-media.txt', created_at: OLD },
      ],
    };
    mocks.referenced.add(`${ws(1)}/task-images/${media(1)}`);
    const { admin } = bucket(files);

    const first = await runTaskMediaCleanup(admin, {
      mode: 'delete',
      now: () => NOW,
    });
    expect(first).toMatchObject({ checked: 2, deleted: 1, capped: false });
    expect(mocks.removed).toEqual([`${ws(1)}/task-images/${media(0)}`]);

    // The deleted file is gone; the next pass removes nothing new.
    files[ws(1)] = files[ws(1)]!.filter((f) => f.name !== media(0));
    mocks.removed.length = 0;
    const second = await runTaskMediaCleanup(admin, {
      mode: 'delete',
      now: () => NOW,
    });
    expect(second).toMatchObject({ checked: 1, deleted: 0 });
    expect(mocks.removed).toEqual([]);
  });

  it('never deletes in dry-run, but reports what it would remove', async () => {
    const { admin } = bucket({ [ws(1)]: old(3) });
    const report = await runTaskMediaCleanup(admin, {
      mode: 'dry-run',
      now: () => NOW,
    });
    expect(report).toMatchObject({
      mode: 'dry-run',
      checked: 3,
      deleted: 0,
      removable: 3,
    });
    expect(mocks.removed).toEqual([]);
  });

  it('checks each page as it is listed instead of listing a workspace first', async () => {
    const { admin } = bucket({ [ws(1)]: old(250) });
    const report = await runTaskMediaCleanup(admin, {
      mode: 'dry-run',
      now: () => NOW,
      limits: { ...TASK_MEDIA_CLEANUP_LIMITS, maxChecked: 50 },
    });
    // The root listing plus the first page only.
    expect(report).toMatchObject({
      capped: 'checked',
      rootListCalls: 1,
      listCalls: 1,
    });
  });

  it('counts nested folder listings toward the list-call cap', async () => {
    const nested = `${ws(1)}/task-images/${ws(9)}`;
    const { admin, list } = bucket({ [ws(1)]: [] });
    const original = list.getMockImplementation()!;
    list.mockImplementation(async (prefix, options) => {
      if (prefix === `${ws(1)}/task-images`)
        return { data: [{ id: null, name: ws(9) }], error: null };
      if (prefix === nested)
        return {
          data: old(1).map((f) => ({ id: `id-${f.name}`, ...f })),
          error: null,
        };
      return original(prefix, options);
    });
    const capped = await runTaskMediaCleanup(admin, {
      mode: 'delete',
      now: () => NOW,
      limits: { ...TASK_MEDIA_CLEANUP_LIMITS, maxListCalls: 1 },
    });
    expect(capped).toMatchObject({ capped: 'list-calls', checked: 0 });
    const full = await runTaskMediaCleanup(admin, {
      mode: 'delete',
      now: () => NOW,
    });
    expect(full).toMatchObject({ listCalls: 2, deleted: 1, capped: false });
    expect(mocks.removed).toEqual([`${nested}/${media(0)}`]);
  });

  it.each([
    ['checked', { maxChecked: 3 }, { checked: 3 }],
    ['removed', { maxRemoved: 2 }, { deleted: 2 }],
    ['list-calls', { maxListCalls: 1 }, { listCalls: 1 }],
  ] as const)('stops at the %s cap', async (reason, cap, counts) => {
    const { admin } = bucket({ [ws(1)]: old(5), [ws(2)]: old(5, 10) });
    const report = await runTaskMediaCleanup(admin, {
      mode: 'delete',
      now: () => NOW,
      limits: { ...TASK_MEDIA_CLEANUP_LIMITS, ...cap },
    });
    expect(report.capped).toBe(reason);
    expect(report).toMatchObject(counts);
    expect(mocks.removed.length).toBeLessThanOrEqual(report.deleted);
  });

  it('stops when the time budget runs out', async () => {
    const { admin } = bucket({ [ws(1)]: old(5) });
    let t = NOW;
    const report = await runTaskMediaCleanup(admin, {
      mode: 'delete',
      now: () => (t += 1000),
      limits: { ...TASK_MEDIA_CLEANUP_LIMITS, timeBudgetMs: 3500 },
    });
    expect(report.capped).toBe('time');
    expect(report.deleted).toBeLessThan(5);
  });

  it('starts from a different workspace each day so a capped pass makes progress', async () => {
    const files = { [ws(1)]: old(1), [ws(2)]: old(1, 10), [ws(3)]: old(1, 20) };
    const firstVisited = async (day: number) => {
      const { admin } = bucket(files);
      mocks.removed.length = 0;
      await runTaskMediaCleanup(admin, {
        mode: 'delete',
        now: () => NOW + day * DAY,
        limits: { ...TASK_MEDIA_CLEANUP_LIMITS, maxChecked: 1 },
      });
      return mocks.removed[0]?.split('/')[0];
    };
    const seen = new Set([
      await firstVisited(0),
      await firstVisited(1),
      await firstVisited(2),
    ]);
    expect(seen).toEqual(new Set([ws(1), ws(2), ws(3)]));
  });

  it('fails the pass when the root workspace listing exceeds its own budget', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 250 }, (_, i) => [ws(i), []])
    );
    const { admin } = bucket(files);
    await expect(
      runTaskMediaCleanup(admin, {
        mode: 'delete',
        now: () => NOW,
        limits: { ...TASK_MEDIA_CLEANUP_LIMITS, maxRootListCalls: 2 },
      })
    ).rejects.toThrow('Workspace listing has at least 200 entries');
  });

  it('steps back for emptied nested folders so the next page skips nothing', async () => {
    // 120 per-task folders under task-images, each holding one old orphan.
    const folders = Array.from({ length: 120 }, (_, i) => ws(1000 + i));
    const present = new Set(folders);
    const { admin, list } = bucket({ [ws(1)]: [] });
    const original = list.getMockImplementation()!;
    list.mockImplementation(async (prefix, options) => {
      if (prefix === `${ws(1)}/task-images`) {
        const live = folders.filter((f) => present.has(f));
        return {
          data: live
            .slice(options.offset, options.offset + options.limit)
            .map((name) => ({ id: null, name })),
          error: null,
        };
      }
      const folder = folders.find((f) => prefix.endsWith(`/${f}`));
      if (folder)
        return {
          data: present.has(folder)
            ? [{ id: `id-${folder}`, name: media(0), created_at: OLD }]
            : [],
          error: null,
        };
      return original(prefix, options);
    });
    // Deleting a folder's only file makes the folder disappear.
    mocks.onRemove = (path) => present.delete(path.split('/')[2]!);
    const report = await runTaskMediaCleanup(admin, {
      mode: 'delete',
      now: () => NOW,
      limits: {
        ...TASK_MEDIA_CLEANUP_LIMITS,
        maxRemoved: 1000,
        maxChecked: 1000,
      },
    });
    expect(report.deleted).toBe(120);
    expect(present.size).toBe(0);
  });

  it('never steps back for folders that were already empty', async () => {
    // A full page of empty per-task folders, then one real orphan after them.
    const empties = Array.from({ length: 100 }, (_, i) => ws(2000 + i));
    const { admin, list } = bucket({ [ws(1)]: [] });
    const original = list.getMockImplementation()!;
    list.mockImplementation(async (prefix, options) => {
      if (prefix === `${ws(1)}/task-images`) {
        const all = [
          ...empties.map((name) => ({ id: null, name })),
          ...old(1).map((f) => ({ id: `id-${f.name}`, ...f })),
        ];
        return {
          data: all.slice(options.offset, options.offset + options.limit),
          error: null,
        };
      }
      if (empties.some((f) => prefix.endsWith(`/${f}`)))
        return { data: [], error: null };
      return original(prefix, options);
    });
    for (const mode of ['dry-run', 'delete'] as const) {
      const report = await runTaskMediaCleanup(admin, { mode, now: () => NOW });
      // Two task-images pages plus one listing per empty folder; no re-listing.
      expect(report).toMatchObject({
        capped: false,
        listCalls: 102,
        checked: 1,
      });
    }
  });

  it('switches stride when the workspace count is a multiple of 97', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 97 }, (_, i) => [ws(i), old(1, i * 10)])
    );
    const start = async (day: number) => {
      const { admin } = bucket(files);
      mocks.removed.length = 0;
      await runTaskMediaCleanup(admin, {
        mode: 'delete',
        now: () => NOW + day * DAY,
        limits: { ...TASK_MEDIA_CLEANUP_LIMITS, maxChecked: 1 },
      });
      return mocks.removed[0]?.split('/')[0];
    };
    const days = [await start(0), await start(1), await start(2)];
    expect(new Set(days).size).toBe(3);
  });

  it('counts a workspace listing failure and keeps going', async () => {
    const { admin, list } = bucket({ [ws(1)]: old(1), [ws(2)]: old(1, 10) });
    const original = list.getMockImplementation()!;
    list.mockImplementation(async (prefix, options) =>
      prefix.startsWith(ws(1))
        ? { data: null, error: new Error('boom') }
        : original(prefix, options)
    );
    const report = await runTaskMediaCleanup(admin, {
      mode: 'delete',
      now: () => NOW,
    });
    expect(report.failed).toBe(1);
    expect(report.deleted).toBe(1);
  });
});
