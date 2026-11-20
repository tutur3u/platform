import {
  chatRealtimeBodyDigest,
  verifyChatRealtimeTicket,
} from '@tuturuuu/realtime/chat/ticket';
import { expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from '../dispatch';
import { LedgerCore, localLedger, memoryLedgerStore } from '../ledger';

const job = 'chat-realtime-revocations';
const now = Date.parse('2026-11-20T05:39:59.000Z');
const actor = 'a6742000-0000-4000-8000-000000000001';
const member = 'a6742000-0000-4000-8000-000000000002';
const workspace = 'a6742000-0000-4000-8000-000000000011';
const conversation = 'a6742000-0000-4000-8000-000000000021';
const createdAt = '2026-11-20T05:28:00.000Z';
const row = {
  actor_id: actor,
  chat_conversations: { ws_id: workspace },
  conversation_id: conversation,
  created_at: createdAt,
  id: 'a6742000-0000-4000-8000-000000000031',
  metadata: { mode: 'archived', type: 'channel' },
};
const env = {
  CHAT_REALTIME_URL: 'https://chat.example.test',
  CHAT_REALTIME_TOKEN_SECRET: 'isolated-chat-processor-signing-fixture',
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SECRET_KEY: 'isolated-database-fixture',
};

function harness(
  respond: (url: URL, init?: RequestInit) => Response | Promise<Response>
) {
  const { store } = memoryLedgerStore();
  let ledger = localLedger(new LedgerCore(store));
  let runAt = now;
  const fetch = vi.fn((url: URL, init?: RequestInit) =>
    Promise.resolve(respond(url, init))
  );
  const deps = {
    fetch: fetch as unknown as typeof globalThis.fetch,
    ledger: vi.fn(() => ledger),
    now: () => runAt,
    sleep: async () => undefined,
  };
  return {
    deps,
    fetch,
    restart: () => {
      ledger = localLedger(new LedgerCore(store));
    },
    run: (enabled = job, slotOffset = 0) => {
      runAt = now + slotOffset * 5 * 60_000;
      return dispatchScheduledJobs(
        '*/5 * * * *',
        runAt,
        { ...env, CRON_CONTROL_ENABLED_JOBS: enabled },
        deps
      );
    },
  };
}

it('stays off by default and checks Worker health before any database read', async () => {
  const h = harness((url) => {
    expect(url.pathname).toBe('/health');
    return Response.json({ ok: true, stopped: true });
  });
  expect(await h.run('')).toEqual([]);
  expect(h.fetch).not.toHaveBeenCalled();
  expect(h.deps.ledger).not.toHaveBeenCalled();
  expect(await h.run()).toMatchObject([
    { id: job, attempts: 1, outcome: 'stopped' },
  ]);
  expect(h.fetch).toHaveBeenCalledTimes(1);
});

it('uses the durable stop fence before publishing any record', async () => {
  const h = harness((url) => {
    if (url.pathname === '/health')
      return Response.json({ ok: true, stopped: false });
    expect(url.pathname).toBe('/rest/v1/chat_audit_events');
    return Response.json([row]);
  });
  vi.spyOn(h.deps.ledger(), 'checkFence')
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(true)
    .mockResolvedValue(false);
  expect(await h.run()).toMatchObject([{ id: job, outcome: 'stopped' }]);
  expect(h.fetch).toHaveBeenCalledTimes(2);
});

it('recovers archive recipients with a body-bound audit replay inside the freshness window', async () => {
  const h = harness(async (url, init) => {
    const headers = new Headers(init?.headers);
    switch (url.pathname) {
      case '/health':
        return Response.json({ ok: true, stopped: false });
      case '/rest/v1/chat_audit_events':
        expect(headers.get('Accept-Profile')).toBe('private');
        expect(url.searchParams.getAll('created_at')).toEqual([
          'gte.2026-11-20T05:25:51.000Z',
          'lt.2026-11-20T05:35:00.000Z',
        ]);
        expect(url.searchParams.get('limit')).toBe('33');
        return Response.json([row]);
      case '/rest/v1/chat_conversation_members':
        expect(url.searchParams.get('archived_at')).toBe(`eq.${createdAt}`);
        expect(url.searchParams.get('conversation_id')).toBe(
          `eq.${conversation}`
        );
        return Response.json([{ user_id: actor }, { user_id: member }]);
      case '/v1/publish': {
        const body = String(init?.body);
        expect(headers.get('apikey')).toBeNull();
        const token = headers.get('authorization')?.replace(/^Bearer /u, '');
        if (!token) throw new Error('Missing body-bound ticket');
        expect(
          await verifyChatRealtimeTicket(
            token,
            env.CHAT_REALTIME_TOKEN_SECRET,
            now
          )
        ).toMatchObject({
          kind: 'publish',
          wsId: workspace,
          bodySha256: await chatRealtimeBodyDigest(body),
        });
        expect(JSON.parse(body)).toMatchObject({
          id: row.id,
          type: 'conversation.deleted',
          audience: { scope: 'users', userIds: [actor, member] },
        });
        return Response.json({ ok: true });
      }
      default:
        throw new Error('Unexpected target');
    }
  });
  expect(await h.run()).toMatchObject([
    { id: job, outcome: 'ok', detail: { capped: 0, delivered: 1, failed: 0 } },
  ]);
});

it('attempts at most 32 records and leaves failed delivery to a later slot', async () => {
  let published = 0;
  const h = harness((url) => {
    if (url.pathname === '/health')
      return Response.json({ ok: true, stopped: false });
    if (url.pathname === '/rest/v1/chat_audit_events')
      return Response.json(auditRows(33));
    expect(url.pathname).toBe('/v1/publish');
    published += 1;
    if (published === 1) return new Response(null, { status: 503 });
    return Response.json({ ok: true });
  });
  expect(await h.run()).toMatchObject([
    {
      id: job,
      outcome: 'failed',
      attempts: 1,
      detail: { capped: 1, delivered: 31, failed: 1 },
    },
  ]);
  expect(published).toBe(32);
});

function auditRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...row,
    id: `a6742000-0000-4000-8000-${String(count - index).padStart(12, '0')}`,
    created_at: '2026-11-20T05:34:00.000Z',
    metadata: { mode: 'left', type: 'group' },
  }));
}

it.each([false, true])(
  'carries undelivered overflow across a ledger restart (partial failure: %j)',
  async (partialFailure) => {
    const rows = auditRows(34);
    const published: string[] = [];
    const oldest = rows.at(-1)?.id;
    const newest = rows[0]?.id;
    let failedOnce = false;
    const h = harness((url, init) => {
      if (url.pathname === '/health')
        return Response.json({ ok: true, stopped: false });
      if (url.pathname === '/rest/v1/chat_audit_events') {
        expect(url.searchParams.get('order')).toBe('created_at.desc,id.desc');
        const delivered =
          url.searchParams.get('id')?.slice(8, -1).split(',') ?? [];
        const remaining = rows.filter(({ id }) => !delivered.includes(id));
        return Response.json(remaining.slice(0, 33));
      }
      const { id } = JSON.parse(String(init?.body));
      published.push(id);
      if (partialFailure && id === newest && !failedOnce) {
        failedOnce = true;
        return new Response(null, { status: 503 });
      }
      return Response.json({ ok: true });
    });
    expect(await h.run()).toMatchObject([
      {
        outcome: partialFailure ? 'failed' : 'degraded',
        detail: { capped: 1, delivered: partialFailure ? 31 : 32 },
      },
    ]);
    const status = (await h.deps.ledger().status())[job];
    expect(status.consecutiveFailures).toBe(partialFailure ? 1 : 0);
    expect(published).toContain(newest);
    expect(published).not.toContain(oldest);
    h.restart();
    expect(await h.run(job, 1)).toMatchObject([
      {
        outcome: 'ok',
        detail: { capped: 0, delivered: partialFailure ? 3 : 2 },
      },
    ]);
    expect(published.slice(32).sort()).toEqual(
      (partialFailure
        ? [newest, rows[32].id, oldest]
        : [rows[32].id, oldest]
      ).sort()
    );
  }
);
