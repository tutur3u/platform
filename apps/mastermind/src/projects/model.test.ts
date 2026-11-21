import { describe, expect, it, vi } from 'vitest';
import type { ProjectsSnapshot, ThreadRow } from './contract';
import { createFixtureThreadsClient } from './fixtures';
import {
  filterCounts,
  t3ThreadLink,
  threadErrorCode,
  unread,
  visibleGroups,
} from './model';
import { receiptLabel } from './receipt-line';
import { createThreadsClient } from './upstream';
import { inScope, MAX_SCAN_PAGES, scanPage } from './queries';

const row = (patch: Partial<ThreadRow>): ThreadRow => ({
  threadId: 't1',
  title: 'A',
  state: 'running',
  updatedAt: '2026-11-22T00:00:00Z',
  itemCount: 10,
  ...patch,
});

const counts = (
  running: number,
  waiting: number,
  failed: number,
  idle: number
) => ({
  running,
  waiting,
  failed,
  idle,
});

const snapshot: ProjectsSnapshot = {
  machineId: 'm4',
  total: 2,
  projects: [
    {
      projectId: 'p1',
      project: 'One',
      threadCount: 3,
      counts: counts(1, 2, 0, 0),
      latestUpdatedAt: '2026-11-22T00:00:00Z',
    },
    {
      projectId: 'p2',
      project: 'Two',
      threadCount: 5,
      counts: counts(0, 0, 1, 4),
      latestUpdatedAt: '2026-11-21T00:00:00Z',
    },
  ],
  unassigned: { threadCount: 2, counts: counts(0, 1, 0, 1) },
};

describe('projects model', () => {
  it('counts unread items and marks never-opened threads new', () => {
    expect(unread(row({ seenItemCount: 7 }))).toBe(3);
    expect(unread(row({ seenItemCount: 12 }))).toBe(0);
    expect(unread(row({}))).toBe('new');
  });

  it('sums chip totals across projects and the unassigned group', () => {
    expect(filterCounts(snapshot)).toEqual({
      all: 10,
      running: 1,
      waiting: 3,
      failed: 1,
      idle: 5,
    });
  });

  it('lists projects, then unassigned, and hides groups without the filtered state', () => {
    expect(visibleGroups(snapshot, 'all').map((g) => g.id)).toEqual([
      'p1',
      'p2',
      'none',
    ]);
    expect(visibleGroups(snapshot, 'waiting').map((g) => g.id)).toEqual([
      'p1',
      'none',
    ]);
    expect(
      visibleGroups(
        {
          ...snapshot,
          unassigned: { threadCount: 0, counts: counts(0, 0, 0, 0) },
        },
        'all'
      )
    ).toHaveLength(2);
  });

  it('links to T3 only when the environment is known', () => {
    expect(t3ThreadLink(undefined, 'x')).toBeUndefined();
    expect(t3ThreadLink('env', 'thread:a%3Ab')).toBe(
      't3-thread://v2/env/thread:a%3Ab'
    );
  });
});

describe('reply receipts', () => {
  const reply = {
    id: '3f1c2b4a-1d2e-4f5a-8b6c-7d8e9f0a1b2c',
    machineId: 'm4',
    threadId: 't1',
    createdAt: '2026-11-22T00:00:00Z',
    state: 'sent' as const,
  };
  const base = { key: reply.id, text: 'hi' };

  it('labels each phase from the receipt only', () => {
    expect(receiptLabel({ phase: 'sending', ...base })).toBe('sending');
    expect(receiptLabel({ phase: 'sent', ...base, reply })).toBe('sent');
    expect(
      receiptLabel({
        phase: 'delivered',
        ...base,
        reply: { ...reply, state: 'delivered', delivery: 'queued' },
      })
    ).toBe('queued');
    expect(
      receiptLabel({
        phase: 'failed',
        ...base,
        error: 'expired',
        retryable: false,
      })
    ).toBe('expired');
    expect(
      receiptLabel({
        phase: 'failed',
        ...base,
        error: 'machine_refused',
        retryable: false,
      })
    ).toBe('failed');
    expect(receiptLabel({ phase: 'needs_mfa', ...base })).toBeUndefined();
    expect(
      receiptLabel({
        phase: 'failed',
        ...base,
        error: 'timeout',
        retryable: true,
      })
    ).toBeUndefined();
  });
});

describe('threads client', () => {
  const owner = {
    id: 'o',
    email: 'o@x',
    token: 'tok',
    expiresAt: Date.now() + 60_000,
  } as never;

  it('maps the client refusals to the page codes', () => {
    expect(threadErrorCode('machine_offline')).toBe('machine_offline');
    expect(threadErrorCode('unknown_thread')).toBe('not_found');
    expect(threadErrorCode('forbidden')).toBe('denied');
    expect(threadErrorCode('invalid_query')).toBe('invalid');
    expect(threadErrorCode('outbox_full')).toBe('unavailable');
    expect(threadErrorCode('unsupported_for_linked_machine')).toBe(
      'unsupported_for_linked_machine'
    );
  });

  it('sends the bearer and query, and parses the page', async () => {
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.headers.get('Authorization')).toBe('Bearer tok');
      const url = new URL(request.url);
      expect(url.pathname).toBe('/api/v1/mastermind/fleet/threads');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        machineId: 'm4',
        q: 'deploy',
        projectId: 'none',
        state: 'waiting',
        limit: '50',
      });
      return Response.json({
        machineId: 'm4',
        threads: [row({ state: 'waiting' })],
        nextCursor: null,
        total: 1,
      });
    });
    const result = await createThreadsClient(owner, fetcher as never).threads(
      'm4',
      { q: 'deploy', projectId: 'none', state: 'waiting', limit: 50 }
    );
    expect(result.kind).toBe('ok');
  });

  it('refuses redirects, unreadable bodies and maps the body code', async () => {
    const redirect = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { Location: 'https://x' } })
    );
    expect(
      await createThreadsClient(owner, redirect as never).machines('m4')
    ).toEqual({ kind: 'error', code: 'unavailable' });
    const bad = vi.fn(async () =>
      Response.json({ machineId: 'm4', machines: [{ label: 1 }] })
    );
    expect(
      await createThreadsClient(owner, bad as never).machines('m4')
    ).toEqual({ kind: 'error', code: 'invalid' });
    const offline = vi.fn(async () =>
      Response.json({ error: 'machine_offline' }, { status: 503 })
    );
    expect(
      await createThreadsClient(owner, offline as never).machines('m4')
    ).toEqual({ kind: 'error', code: 'machine_offline' });
    const busy = vi.fn(async () =>
      Response.json({ error: 'unconfigured' }, { status: 503 })
    );
    expect(
      await createThreadsClient(owner, busy as never).machines('m4')
    ).toEqual({ kind: 'error', code: 'unavailable' });
  });

  it('posts a reply with its idempotency key and keeps the client result', async () => {
    const key = '3f1c2b4a-1d2e-4f5a-8b6c-7d8e9f0a1b2c';
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.method).toBe('POST');
      expect(request.headers.get('Idempotency-Key')).toBe(key);
      expect(await request.json()).toEqual({
        machineId: 'm4',
        threadId: 't1',
        text: 'hi',
      });
      return Response.json(
        {
          id: key,
          machineId: 'm4',
          threadId: 't1',
          state: 'delivered',
          delivery: 'steered',
          createdAt: '2026-11-22T00:00:00Z',
        },
        { status: 202 }
      );
    });
    const result = await createThreadsClient(owner, fetcher as never).reply(
      'm4',
      { threadId: 't1', text: 'hi', idempotencyKey: key }
    );
    expect(result.ok).toBe(true);
  });
});

describe('fixture client', () => {
  it('pages a project 50 at a time and refuses project grouping on linked machines', async () => {
    const client = createFixtureThreadsClient();
    const first = await client.threads('m', {
      projectId: 'tuturuuu',
      limit: 50,
    });
    if (first.kind !== 'ok') throw new Error('expected a page');
    expect(first.data.threads).toHaveLength(50);
    expect(first.data.nextCursor).toBe(50);
    expect(
      (
        await client.threads('m', {
          environmentId: 'env-studio',
          projectId: 'none',
        })
      ).kind
    ).toBe('error');
  });
});

describe('scanPage', () => {
  const live = (rows: ThreadRow[]) => async (cursor: number | undefined) => {
    const start = cursor ?? 0;
    const page = rows.slice(start, start + 50);
    return {
      kind: 'ok' as const,
      fetchedAt: '',
      data: {
        machineId: 'm4',
        threads: page,
        nextCursor: start + 50 < rows.length ? start + 50 : null,
        total: rows.length,
      },
    };
  };
  const rows = Array.from({ length: 300 }, (_, i) =>
    row({
      threadId: `t${i}`,
      state: i >= 120 && i < 125 ? 'failed' : 'idle',
      projectId: i % 2 ? 'p1' : undefined,
    })
  );

  it('keeps reading past pages the filter empties, within a bound', async () => {
    const read = vi.fn(live(rows));
    const page = await scanPage({ state: 'failed' }, undefined, read);
    expect(page.threads.map((r) => r.threadId)).toEqual([
      't120',
      't121',
      't122',
      't123',
      't124',
    ]);
    expect(read).toHaveBeenCalledTimes(MAX_SCAN_PAGES);
    expect(page.nextCursor).toBe(200);
  });

  it('filters by project, with none for threads outside every project', async () => {
    const own = await scanPage(
      { state: 'all', projectId: 'p1' },
      undefined,
      live(rows)
    );
    expect(own.threads).toHaveLength(50);
    expect(own.threads.every((r) => r.projectId === 'p1')).toBe(true);
    const none = await scanPage(
      { state: 'all', projectId: 'none' },
      undefined,
      live(rows)
    );
    expect(none.threads.every((r) => !r.projectId)).toBe(true);
    expect(inScope({ state: 'running' }, row({ state: 'idle' }))).toBe(false);
  });
});
