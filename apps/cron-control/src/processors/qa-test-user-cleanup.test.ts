import { expect, it, vi } from 'vitest';
import {
  CRON_TRIGGERS,
  DATABASE_MAINTENANCE_RPCS,
  findJob,
  parseEnabledJobs,
  processorDeadlineMs,
} from '../jobs';
import { cleanupQaTestUsers } from './qa-test-user-cleanup';
import type { ProcessorContext } from './types';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
const WS = '22222222-2222-4222-8222-222222222222';
const DB = 'https://database.example.test';

type Route = (url: URL, init: RequestInit) => Response;
type Call = { method: string; path: string; init: RequestInit };

function context(
  route: Route,
  {
    fence = async () => true,
    key = 'sb_secret_fixture',
  }: { fence?: (calls: Call[]) => Promise<boolean>; key?: string } = {}
) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(input);
    calls.push({
      method: init.method ?? 'GET',
      path: url.pathname + url.search,
      init,
    });
    return route(url, init);
  });
  const state: ProcessorContext = {
    deadline: 100_000,
    env: { SUPABASE_URL: DB, SUPABASE_SECRET_KEY: key },
    fetch: fetch as unknown as typeof globalThis.fetch,
    fence: () => fence(calls),
    now: () => 0,
    pending: {
      add: vi.fn(),
      list: vi.fn(),
      fail: vi.fn(),
      quarantined: vi.fn(),
      settle: vi.fn(),
    },
    target: { secret: key, url: new URL(DB) },
    userAgent: 'fixture',
  };
  return { state, calls };
}

const rpcName = (url: URL) =>
  url.pathname.startsWith('/rest/v1/rpc/')
    ? url.pathname.slice('/rest/v1/rpc/'.length)
    : null;

function ledger({
  userIds = [USER],
  begin = {
    state: 'deleting',
    authPresent: true,
    runId: 'abcdefgh',
    runWorkspaceId: WS,
  },
  workspaceRecorded = true as unknown,
  authDelete = 200,
  authAfterDelete = 404,
}: {
  userIds?: string[];
  begin?: Record<string, unknown> | Response;
  workspaceRecorded?: unknown;
  authDelete?: number;
  authAfterDelete?: number;
} = {}): Route {
  return (url, init) => {
    switch (rpcName(url)) {
      case 'qa_test_list_expired':
        return Response.json({ mode: 'run', userIds });
      case 'qa_test_begin_delete':
        return begin instanceof Response ? begin.clone() : Response.json(begin);
      case 'qa_test_finish_workspace_delete':
        return workspaceRecorded instanceof Response
          ? workspaceRecorded.clone()
          : Response.json(workspaceRecorded);
      case 'qa_test_finish_delete':
        return Response.json({ state: 'deleted' });
    }
    if (url.pathname === '/rest/v1/workspaces')
      return new Response(null, { status: 204 });
    if (url.pathname.startsWith('/auth/v1/admin/users/')) {
      if (init.method === 'GET')
        return new Response('{}', { status: authAfterDelete });
      if (init.method === 'DELETE')
        return new Response('{}', { status: authDelete });
      return Response.json({});
    }
    return new Response(null, { status: 500 });
  };
}

const sequence = (calls: Call[]) =>
  calls.map((call) => `${call.method} ${call.path}`);
const touchedAuth = (calls: Call[]) =>
  calls.some((call) => call.path.startsWith('/auth/'));
const settled = (calls: Call[]) =>
  calls.some((call) => call.path.endsWith('/qa_test_finish_delete'));

it('is a default-off native Worker job with a 90-second slot deadline', () => {
  const job = findJob('qa-test-user-cleanup');
  expect(job).toMatchObject({
    cron: '*/15 * * * *',
    method: 'POST',
    overlap: 'claim-fenced',
    path: '/rest/v1/rpc/qa_test_list_expired',
    workerProcessor: 'qa-test-user-cleanup',
  });
  if (!job) throw new Error('missing job');
  expect(processorDeadlineMs(job)).toBe(90_000);
  expect(DATABASE_MAINTENANCE_RPCS['qa-test-user-cleanup']).toBe(
    'qa_test_list_expired'
  );
  expect(CRON_TRIGGERS).toContain('*/15 * * * *');
  expect(parseEnabledJobs('').enabled.has('qa-test-user-cleanup')).toBe(false);
});

it('stops before any request when the Cron Control fence is closed', async () => {
  const { state, calls } = context(ledger(), { fence: async () => false });
  await expect(cleanupQaTestUsers(state)).resolves.toEqual({
    detail: {},
    outcome: 'stopped',
  });
  expect(calls).toHaveLength(0);
});

it('honors the ledger stop fence at listing and when each deletion begins', async () => {
  const listing = context(() => Response.json({ mode: 'fenced', userIds: [] }));
  await expect(cleanupQaTestUsers(listing.state)).resolves.toEqual({
    detail: { fenced: 1 },
    outcome: 'ok',
  });
  const begun = context(ledger({ begin: { state: 'fenced' } }));
  await expect(cleanupQaTestUsers(begun.state)).resolves.toMatchObject({
    outcome: 'stopped',
  });
  expect(touchedAuth(begun.calls)).toBe(false);
});

it('removes and records the run workspace, bans then deletes the account, and settles after Auth confirms', async () => {
  const { state, calls } = context(ledger());
  await expect(cleanupQaTestUsers(state)).resolves.toEqual({
    detail: { deleted: 1, unsettled: 0, skipped: 0 },
    outcome: 'ok',
  });
  expect(sequence(calls)).toEqual([
    'POST /rest/v1/rpc/qa_test_list_expired',
    'POST /rest/v1/rpc/qa_test_begin_delete',
    `DELETE /rest/v1/workspaces?id=eq.${WS}&personal=eq.false`,
    'POST /rest/v1/rpc/qa_test_finish_workspace_delete',
    `PUT /auth/v1/admin/users/${USER}`,
    `DELETE /auth/v1/admin/users/${USER}`,
    `GET /auth/v1/admin/users/${USER}`,
    'POST /rest/v1/rpc/qa_test_finish_delete',
  ]);
  expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
    p_user_id: USER,
    p_actor: 'cron',
    p_actor_user: null,
  });
  const auth = calls[4]?.init.headers as Record<string, string>;
  expect(auth.apikey).toBe('sb_secret_fixture');
  expect(auth.Authorization).toBeUndefined();
  expect(calls.every((call) => call.init.redirect === 'manual')).toBe(true);
});

it('sends a legacy JWT service key as the bearer token too', async () => {
  const { state, calls } = context(ledger(), { key: 'eyJ.fixture.jwt' });
  await cleanupQaTestUsers(state);
  const auth = calls.find((call) => call.path.startsWith('/auth/'))?.init
    .headers as Record<string, string>;
  expect(auth.Authorization).toBe('Bearer eyJ.fixture.jwt');
});

it('never settles the last account until the workspace removal is recorded', async () => {
  const { state, calls } = context(ledger({ workspaceRecorded: false }));
  await expect(cleanupQaTestUsers(state)).resolves.toEqual({
    detail: { deleted: 0, unsettled: 1, skipped: 0 },
    outcome: 'failed',
  });
  expect(touchedAuth(calls)).toBe(false);
  expect(settled(calls)).toBe(false);
});

it('re-checks the Cron Control fence before the Auth delete', async () => {
  const { state, calls } = context(ledger(), {
    fence: async (seen) => !seen.some((call) => call.method === 'PUT'),
  });
  await expect(cleanupQaTestUsers(state)).resolves.toMatchObject({
    outcome: 'stopped',
  });
  expect(
    calls.some(
      (call) => call.method === 'DELETE' && call.path.startsWith('/auth/')
    )
  ).toBe(false);
  expect(settled(calls)).toBe(false);
});

it('settles on Auth presence, not on the delete status', async () => {
  const gone = context(ledger({ authDelete: 503, authAfterDelete: 404 }));
  await expect(cleanupQaTestUsers(gone.state)).resolves.toMatchObject({
    outcome: 'ok',
  });
  const refused = context(
    ledger({ authDelete: 422, authAfterDelete: 200, userIds: [USER, OTHER] })
  );
  await expect(cleanupQaTestUsers(refused.state)).resolves.toEqual({
    detail: { deleted: 0, unsettled: 2, skipped: 0 },
    outcome: 'failed',
  });
  expect(settled(refused.calls)).toBe(false);
});

it('ends the slot as unknown on an unconfirmed write, before touching the next account', async () => {
  for (const options of [
    { begin: new Response('not json', { status: 200 }) },
    { begin: new Response('{}', { status: 503 }) },
    { begin: new Response(null, { status: 307 }) },
    { workspaceRecorded: new Response(null, { status: 302 }) },
    { authAfterDelete: 503 },
    { authDelete: 503, authAfterDelete: 200 },
    { authDelete: 200, authAfterDelete: 200 },
  ]) {
    const { state, calls } = context(
      ledger({ ...options, userIds: [USER, OTHER] })
    );
    await expect(cleanupQaTestUsers(state)).resolves.toEqual({
      detail: { deleted: 0, unsettled: 1, skipped: 1 },
      outcome: 'unknown',
    });
    expect(calls.some((call) => String(call.init.body).includes(OTHER))).toBe(
      false
    );
  }
});

it('never touches Auth for accounts the ledger refuses or already holds', async () => {
  for (const begin of [
    { state: 'busy' },
    { state: 'deleted' },
    { state: 'not_found' },
  ]) {
    const { state, calls } = context(ledger({ begin }));
    await cleanupQaTestUsers(state);
    expect(touchedAuth(calls)).toBe(false);
  }
});

it('treats a malformed or oversized listing as an unknown outcome', async () => {
  for (const body of [
    { mode: 'run', userIds: ['not-a-uuid'] },
    { mode: 'run', userIds: Array.from({ length: 26 }, () => USER) },
    { mode: 'other', userIds: [] },
  ]) {
    const { state, calls } = context(() => Response.json(body));
    await expect(cleanupQaTestUsers(state)).resolves.toEqual({
      detail: {},
      outcome: 'unknown',
    });
    expect(calls).toHaveLength(1);
  }
});
