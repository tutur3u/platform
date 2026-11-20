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
  const ledger = localLedger(new LedgerCore(store));
  const fetch = vi.fn((url: URL, init?: RequestInit) =>
    Promise.resolve(respond(url, init))
  );
  const deps = {
    fetch: fetch as unknown as typeof globalThis.fetch,
    ledger: vi.fn(() => ledger),
    now: () => now,
    sleep: async () => undefined,
  };
  return {
    deps,
    fetch,
    run: (enabled = job) =>
      dispatchScheduledJobs(
        '*/5 * * * *',
        now,
        { ...env, CRON_CONTROL_ENABLED_JOBS: enabled },
        deps
      ),
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
    if (url.pathname === '/rest/v1/chat_audit_events') {
      return Response.json(
        Array.from({ length: 33 }, () => ({
          ...row,
          metadata: { mode: 'left', type: 'group' },
        }))
      );
    }
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
