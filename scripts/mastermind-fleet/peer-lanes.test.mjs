import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  classifyPeer,
  laneStateFor,
  listPeerThreads,
  peerUrlAllowed,
  readPeers,
  readPeerToken,
} from './peer-lanes.mjs';
import { fakePeers, threadLister } from './fixture.mjs';

const NOW = new Date('2026-11-20T03:00:00.000Z');
const FUTURE = '2026-12-20T03:00:00.000Z';
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();

function thread(threadId, status, updatedAt, extra = {}) {
  return {
    threadId,
    title: `T ${threadId}`,
    status,
    projectId: 'p1',
    providerInstanceId: 'codex',
    model: 'gpt-6',
    parentThreadId: null,
    latestRunId: `run-${threadId}`,
    updatedAt,
    ...extra,
  };
}

function secretsDir(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peer-secrets-'));
  for (const [name, token, mode = 0o600] of entries) {
    fs.writeFileSync(path.join(dir, `${name}.bin`), token, { mode });
    fs.chmodSync(path.join(dir, `${name}.bin`), mode);
  }
  return dir;
}

test('classifies heartbeats: live, grace, stale, offline, expired', () => {
  const at = (lastSeenAt, reachedNow = false, expiresAt) =>
    classifyPeer({ reachedNow, lastSeenAt, expiresAt }, NOW);
  assert.equal(at(minutesAgo(90), true), 'online');
  assert.equal(at(minutesAgo(1)), 'online');
  assert.equal(at(minutesAgo(5)), 'stale');
  assert.equal(at(minutesAgo(29)), 'stale');
  assert.equal(at(minutesAgo(31)), 'offline');
  assert.equal(at(undefined), 'offline');
  assert.equal(at(minutesAgo(0), true, minutesAgo(1)), 'offline');
});

test('maps T3 statuses and only trusts HTTPS or loopback addresses', () => {
  assert.deepEqual(
    ['starting', 'waiting', 'queued', 'failed', 'completed', 'interrupted'].map(
      laneStateFor
    ),
    ['running', 'waiting', 'queued', 'failed', 'idle', 'idle']
  );
  assert.ok(peerUrlAllowed('https://prod-1.t3coderelay.com'));
  assert.ok(peerUrlAllowed('http://127.0.0.1:3773'));
  assert.ok(!peerUrlAllowed('http://studio.lan:3773'));
  assert.ok(!peerUrlAllowed('https://user:pw@relay.example'));
  assert.ok(!peerUrlAllowed('not a url'));
});

test('refuses loose-mode or path-escaping peer credentials', () => {
  const dir = secretsDir([
    ['peer-link-good', 'x'.repeat(40)],
    ['peer-link-loose', 'x'.repeat(40), 0o644],
  ]);
  assert.equal(readPeerToken(dir, 'peer-link-good'), 'x'.repeat(40));
  assert.equal(readPeerToken(dir, 'peer-link-loose'), null);
  assert.equal(readPeerToken(dir, '../peer-link-good'), null);
  assert.equal(readPeerToken(dir, 'peer-link-missing'), null);
});

test('lists every active page, recent failures and recent idle threads', async () => {
  const threads = [
    ...Array.from({ length: 130 }, (_, i) =>
      thread(`run-${i}`, 'running', minutesAgo(i % 60))
    ),
    thread('wait', 'waiting', minutesAgo(3)),
    thread('fail-new', 'failed', minutesAgo(30)),
    thread('fail-old', 'failed', minutesAgo(3 * 24 * 60)),
    thread('done-new', 'completed', minutesAgo(10)),
    thread('done-old', 'completed', minutesAgo(2 * 24 * 60)),
  ];
  const list = threadLister(threads);
  const rows = await listPeerThreads(
    async (name, args) =>
      name === 't3_project_list'
        ? { projects: [{ id: 'p1', title: 'platform' }] }
        : list(args),
    NOW
  );
  const ids = new Set(rows.map((row) => row.threadId));
  assert.equal(rows.filter((row) => row.state === 'running').length, 130);
  for (const id of ['wait', 'fail-new', 'done-new']) assert.ok(ids.has(id), id);
  for (const id of ['fail-old', 'done-old']) assert.ok(!ids.has(id), id);
  assert.equal(rows.find((row) => row.threadId === 'done-new').state, 'idle');
  assert.equal(rows[0].projectTitle, 'platform');
});

test('probes peers live, keeps a stale peer, drops an offline one', async () => {
  const dir = secretsDir([
    ['peer-link-a', 'token-a-0123456789abcdef'],
    ['peer-link-b', 'token-b-0123456789abcdef'],
    ['peer-link-c', 'token-c-0123456789abcdef'],
  ]);
  const peers = fakePeers({
    'https://a.relay.test': {
      environmentId: 'env-a',
      token: 'token-a-0123456789abcdef',
      sse: true,
      list: threadLister([thread('a1', 'running', minutesAgo(1))]),
    },
    'https://b-alt.relay.test': {
      environmentId: 'env-b',
      token: 'token-b-0123456789abcdef',
      list: threadLister([thread('b1', 'waiting', minutesAgo(2))]),
    },
  });
  const links = [
    {
      environment_id: 'env-a',
      expires_at: FUTURE,
      fenced: 1,
      label: 'Skora Macbook M3 Pro',
      secret_name: 'peer-link-a',
      urls_json: '["https://a.relay.test"]',
      // T3 has not contacted it for an hour; the live probe decides.
      last_reached_at: minutesAgo(60),
    },
    {
      environment_id: 'env-b',
      expires_at: FUTURE,
      fenced: 1,
      label: 'MacStudio1',
      secret_name: 'peer-link-b',
      urls_json: '["https://b.relay.test", "https://b-alt.relay.test"]',
    },
    {
      environment_id: 'env-c',
      expires_at: FUTURE,
      fenced: 1,
      label: 'C02',
      secret_name: 'peer-link-c',
      urls_json: '["https://c.relay.test"]',
    },
    {
      environment_id: 'env-d',
      expires_at: FUTURE,
      fenced: 1,
      label: 'Old laptop',
      secret_name: 'peer-link-c',
      urls_json: '["https://c.relay.test"]',
    },
    {
      environment_id: 'env-e',
      fenced: 1,
      label: 'Expired',
      secret_name: 'peer-link-a',
      urls_json: '["https://e.relay.test"]',
      expires_at: minutesAgo(1),
    },
  ];
  links.push(
    {
      // T3 reached it a minute ago, but this publisher's listing is old:
      // its lanes must not come back.
      environment_id: 'env-f',
      expires_at: FUTURE,
      fenced: 1,
      label: 'Resurrected',
      secret_name: 'peer-link-c',
      urls_json: '["https://c.relay.test"]',
      last_reached_at: minutesAgo(1),
    },
    {
      // Re-linked under a new credential: the old cache entry is ignored.
      environment_id: 'env-g',
      expires_at: FUTURE,
      fenced: 1,
      label: 'Relinked',
      secret_name: 'peer-link-new',
      urls_json: '["https://c.relay.test"]',
    }
  );
  const cachedLane = (id, minutes) => ({
    threadId: id,
    state: 'running',
    updatedAt: minutesAgo(minutes),
  });
  const cache = {
    'env-c': {
      linkKey: 'env-c:peer-link-c:',
      lastSeenAt: minutesAgo(10),
      lanesAt: minutesAgo(10),
      threads: [cachedLane('c1', 10)],
    },
    'env-d': {
      linkKey: 'env-d:peer-link-c:',
      lastSeenAt: minutesAgo(45),
      lanesAt: minutesAgo(45),
      threads: [cachedLane('d1', 45)],
    },
    'env-f': {
      linkKey: 'env-f:peer-link-c:',
      lastSeenAt: minutesAgo(40),
      lanesAt: minutesAgo(40),
      threads: [cachedLane('f1', 40)],
    },
    'env-g': {
      linkKey: 'env-g:peer-link-old:',
      lastSeenAt: minutesAgo(1),
      lanesAt: minutesAgo(1),
      threads: [cachedLane('g1', 1)],
    },
  };
  const result = await readPeers({
    links,
    secretsDir: dir,
    cache,
    now: NOW,
    fetchImpl: peers.fetchImpl,
  });
  const byId = Object.fromEntries(
    result.peers.map((p) => [p.environment_id, p])
  );
  assert.equal(byId['env-a'].status, 'online');
  assert.equal(byId['env-a'].lastSeenAt, NOW.toISOString());
  assert.deepEqual(
    byId['env-a'].threads.map((t) => t.threadId),
    ['a1']
  );
  assert.equal(byId['env-b'].status, 'online');
  assert.deepEqual(
    byId['env-b'].threads.map((t) => t.threadId),
    ['b1']
  );
  assert.equal(byId['env-c'].status, 'stale');
  assert.deepEqual(
    byId['env-c'].threads.map((t) => t.threadId),
    ['c1']
  );
  assert.equal(byId['env-d'].status, 'offline');
  assert.deepEqual(byId['env-d'].threads, []);
  assert.equal(byId['env-e'].status, 'offline');
  assert.equal(byId['env-f'].status, 'online');
  assert.deepEqual(byId['env-f'].threads, []);
  assert.equal(byId['env-g'].status, 'offline');
  assert.deepEqual(byId['env-g'].threads, []);
  assert.equal(result.cache['env-d'].threads, undefined);
  assert.equal(byId['env-a'].live, true);
  assert.equal(byId['env-c'].live, false);
  assert.equal(result.cache['env-a'].lastSeenAt, NOW.toISOString());
  assert.equal(result.cache['env-c'].lastSeenAt, minutesAgo(10));
  // Each token only goes to its own link's addresses; every session closes.
  for (const call of peers.calls) {
    if (call.auth?.includes('token-a'))
      assert.equal(call.origin, 'https://a.relay.test');
    if (call.auth?.includes('token-b'))
      assert.match(call.origin, /^https:\/\/b(-alt)?\.relay\.test$/);
  }
  assert.ok(
    !peers.calls.some((call) => call.origin === 'https://e.relay.test')
  );
  assert.equal(peers.calls.filter((c) => c.method === 'DELETE').length, 2);
});

test('gives up on a hanging peer within its deadline', async () => {
  const dir = secretsDir([['peer-link-slow', 'token-slow-0123456789abcdef']]);
  const hanging = (url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
  const started = Date.now();
  const { peers } = await readPeers({
    links: [
      {
        environment_id: 'env-slow',
        expires_at: FUTURE,
        fenced: 1,
        label: 'Slow',
        secret_name: 'peer-link-slow',
        urls_json: '["https://slow-1.relay.test", "https://slow-2.relay.test"]',
        last_reached_at: minutesAgo(10),
      },
    ],
    secretsDir: dir,
    now: NOW,
    fetchImpl: hanging,
    deadlineMs: 60,
  });
  assert.ok(Date.now() - started < 2_000);
  assert.equal(peers[0].status, 'stale');
  assert.deepEqual(peers[0].threads, []);
});

test('refuses symlinked credentials', () => {
  const dir = secretsDir([['peer-link-real', 'x'.repeat(40)]]);
  fs.symlinkSync(
    path.join(dir, 'peer-link-real.bin'),
    path.join(dir, 'peer-link-link.bin')
  );
  assert.equal(readPeerToken(dir, 'peer-link-link'), null);
});

test('treats a malformed reply as unreachable and still closes the session', async () => {
  const dir = secretsDir([['peer-link-m', 'token-m-0123456789abcdef']]);
  const replies = {
    'https://empty.relay.test': () => new Response('', { status: 200 }),
    'https://wrong-id.relay.test': (body) =>
      Response.json(
        { jsonrpc: '2.0', id: body.id + 7, result: { protocolVersion: 'x' } },
        { headers: { 'mcp-session-id': 's' } }
      ),
    'https://no-threads.relay.test': (body) =>
      Response.json(
        {
          jsonrpc: '2.0',
          id: body.id,
          result:
            body.method === 'initialize'
              ? { protocolVersion: '2025-06-18' }
              : { content: [{ type: 'text', text: '{"nope":1}' }] },
        },
        { headers: { 'mcp-session-id': 's' } }
      ),
  };
  const closed = [];
  const fetchImpl = async (url, init) => {
    const { origin, pathname } = new URL(url);
    if (pathname === '/.well-known/t3/environment')
      return Response.json({ environmentId: 'env-m' });
    if (init.method === 'DELETE') {
      closed.push(origin);
      return new Response(null, { status: 204 });
    }
    const body = JSON.parse(init.body);
    if (body.id === undefined) return new Response(null, { status: 202 });
    return replies[origin](body);
  };
  const cache = {
    'env-m': {
      linkKey: 'env-m:peer-link-m:',
      lastSeenAt: minutesAgo(5),
      lanesAt: minutesAgo(5),
      threads: [{ threadId: 'm1', state: 'running', updatedAt: minutesAgo(5) }],
    },
  };
  const { peers } = await readPeers({
    links: [
      {
        environment_id: 'env-m',
        expires_at: FUTURE,
        fenced: 1,
        label: 'Malformed',
        secret_name: 'peer-link-m',
        urls_json: JSON.stringify(Object.keys(replies)),
      },
    ],
    secretsDir: dir,
    cache,
    now: NOW,
    fetchImpl,
  });
  assert.equal(peers[0].live, false);
  assert.equal(peers[0].status, 'stale');
  assert.deepEqual(
    peers[0].threads.map((t) => t.threadId),
    ['m1']
  );
  assert.deepEqual(closed, [
    'https://wrong-id.relay.test',
    'https://no-threads.relay.test',
  ]);
});

test('collects running work before newer queued threads', async () => {
  const threads = [
    ...Array.from({ length: 320 }, (_, i) =>
      thread(`q-${i}`, 'queued', minutesAgo(i / 100))
    ),
    thread('old-run', 'running', minutesAgo(300)),
    thread('never-ran', 'idle', minutesAgo(1), { latestRunId: null }),
  ];
  const list = threadLister(threads);
  const rows = await listPeerThreads(
    async (name, args) =>
      name === 't3_project_list' ? { projects: [] } : list(args),
    NOW
  );
  assert.equal(rows.length, 300);
  assert.equal(rows[0].threadId, 'old-run');
  assert.ok(!rows.some((row) => row.threadId === 'never-ran'));
});

test('refuses a FIFO at the credential path without blocking', async () => {
  const dir = secretsDir([]);
  const { execFileSync } = await import('node:child_process');
  execFileSync('mkfifo', ['-m', '600', path.join(dir, 'peer-link-fifo.bin')]);
  assert.equal(readPeerToken(dir, 'peer-link-fifo'), null);
});

test('rejects a listing with a malformed row and keeps the cache', async () => {
  const dir = secretsDir([['peer-link-r', 'token-r-0123456789abcdef']]);
  const peers = fakePeers({
    'https://rows.relay.test': {
      environmentId: 'env-r',
      token: 'token-r-0123456789abcdef',
      list: () => ({ threads: [null], nextCursor: null }),
    },
  });
  const { peers: result } = await readPeers({
    links: [
      {
        environment_id: 'env-r',
        expires_at: FUTURE,
        fenced: 1,
        label: 'Rows',
        secret_name: 'peer-link-r',
        urls_json: '["https://rows.relay.test"]',
      },
    ],
    secretsDir: dir,
    cache: {
      'env-r': {
        linkKey: 'env-r:peer-link-r:',
        lastSeenAt: minutesAgo(1),
        lanesAt: minutesAgo(1),
        threads: [
          { threadId: 'r1', state: 'running', updatedAt: minutesAgo(1) },
        ],
      },
    },
    now: NOW,
    fetchImpl: peers.fetchImpl,
  });
  assert.equal(result[0].live, false);
  assert.deepEqual(
    result[0].threads.map((t) => t.threadId),
    ['r1']
  );
});

test('pages recent threads past a page of active ones', async () => {
  const threads = [
    ...Array.from({ length: 101 }, (_, i) =>
      thread(`run-${i}`, 'running', minutesAgo(i / 10))
    ),
    thread('done', 'completed', minutesAgo(30)),
  ];
  const list = threadLister(threads);
  const rows = await listPeerThreads(
    async (name, args) =>
      name === 't3_project_list' ? { projects: [] } : list(args),
    NOW
  );
  assert.equal(rows.length, 102);
  assert.ok(rows.some((row) => row.threadId === 'done'));
});

test('sends no credential to an address that answers as another environment', async () => {
  const dir = secretsDir([['peer-link-id', 'token-id-0123456789abcdef']]);
  const peers = fakePeers({
    'https://moved.relay.test': {
      environmentId: 'someone-else',
      token: 'token-id-0123456789abcdef',
      list: threadLister([thread('x', 'running', minutesAgo(1))]),
    },
  });
  const { peers: result } = await readPeers({
    links: [
      {
        environment_id: 'env-id',
        label: 'Moved',
        secret_name: 'peer-link-id',
        urls_json: '["https://moved.relay.test"]',
        expires_at: FUTURE,
        fenced: 1,
      },
    ],
    secretsDir: dir,
    now: NOW,
    fetchImpl: peers.fetchImpl,
  });
  assert.equal(result[0].live, false);
  assert.ok(peers.calls.every((call) => call.auth === undefined));
});

test('never probes an unfenced link, and keeps a renewed lease', async () => {
  const dir = secretsDir([['peer-link-l', 'token-l-0123456789abcdef']]);
  const peer = {
    environmentId: 'env-l',
    token: 'token-l-0123456789abcdef',
    list: threadLister([thread('l1', 'running', minutesAgo(1))]),
  };
  const peers = fakePeers({ 'https://lease.relay.test': peer });
  const renewed = '2027-01-20T03:00:00.000Z';
  const leaseFetch = async (url, init) => {
    const response = await peers.fetchImpl(url, init);
    if (init.method !== 'POST') return response;
    const headers = new Headers(response.headers);
    headers.set('t3-link-expires-at', renewed);
    return new Response(await response.text(), {
      status: response.status,
      headers,
    });
  };
  const link = {
    environment_id: 'env-l',
    label: 'Lease',
    secret_name: 'peer-link-l',
    urls_json: '["https://lease.relay.test"]',
    linked_at: '2026-11-01T00:00:00.000Z',
    expires_at: minutesAgo(-10),
    fenced: 1,
  };
  const unfenced = await readPeers({
    links: [{ ...link, fenced: 0 }],
    secretsDir: dir,
    now: NOW,
    fetchImpl: leaseFetch,
  });
  assert.equal(unfenced.peers[0].status, 'offline');
  assert.equal(peers.calls.length, 0);

  const first = await readPeers({
    links: [link],
    secretsDir: dir,
    now: NOW,
    fetchImpl: leaseFetch,
  });
  assert.equal(first.cache['env-l'].leaseExpiresAt, renewed);
  // An hour later the database still has the old expiry; the lease holds.
  const later = new Date(NOW.getTime() + 60 * 60_000);
  const second = await readPeers({
    links: [link],
    secretsDir: dir,
    cache: first.cache,
    now: later,
    fetchImpl: leaseFetch,
  });
  assert.equal(second.peers[0].live, true);
  // Re-linking starts a new generation; the old lease no longer applies.
  const relinked = await readPeers({
    links: [{ ...link, linked_at: '2026-11-19T00:00:00.000Z' }],
    secretsDir: dir,
    cache: first.cache,
    now: later,
    fetchImpl: leaseFetch,
  });
  assert.equal(relinked.peers[0].status, 'offline');
});

test('rejects rows without a run id and cursors that do not advance', async () => {
  const bad = [
    {
      threads: [
        { ...thread('a', 'running', minutesAgo(1)), latestRunId: undefined },
      ],
      nextCursor: null,
    },
    { threads: [thread('a', 'running', minutesAgo(1))] },
    { threads: [thread('a', 'running', minutesAgo(1))], nextCursor: 0 },
  ];
  for (const page of bad)
    await assert.rejects(
      listPeerThreads(
        async (name) => (name === 't3_project_list' ? { projects: [] } : page),
        NOW
      ),
      /peer_list_invalid/
    );
});

test('finds a recent run behind many newer threads that never ran', async () => {
  const threads = [
    ...Array.from({ length: 400 }, (_, i) =>
      thread(`new-${i}`, 'idle', minutesAgo(i / 100), { latestRunId: null })
    ),
    thread('done', 'completed', minutesAgo(600)),
  ];
  const list = threadLister(threads);
  const rows = await listPeerThreads(
    async (name, args) =>
      name === 't3_project_list' ? { projects: [] } : list(args),
    NOW
  );
  assert.deepEqual(
    rows.map((row) => row.threadId),
    ['done']
  );
});

test('reports per-status totals past the peer lane cap', async () => {
  const threads = [
    ...Array.from({ length: 301 }, (_, i) =>
      thread(`run-${i}`, 'running', minutesAgo(i / 100))
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      thread(`q-${i}`, 'queued', minutesAgo(i))
    ),
  ];
  const list = threadLister(threads);
  const rows = await listPeerThreads(
    async (name, args) =>
      name === 't3_project_list' ? { projects: [] } : list(args),
    NOW
  );
  assert.equal(rows.length, 300);
  assert.deepEqual(rows.extraCounts, { running: 1, queued: 4 });
});

test('allows tailnet HTTP like T3 and races descriptor probes', async () => {
  assert.ok(peerUrlAllowed('http://studio.tail663991.ts.net:3773'));
  assert.ok(peerUrlAllowed('http://[fd7a:115c:a1e0::1]:3773'));
  assert.ok(!peerUrlAllowed('http://100.64.0.1:3773'));
  const dir = secretsDir([['peer-link-t', 'token-t-0123456789abcdef']]);
  const good = fakePeers({
    'https://good.relay.test': {
      environmentId: 'env-t',
      token: 'token-t-0123456789abcdef',
      list: threadLister([thread('t1', 'running', minutesAgo(1))]),
    },
  });
  // Three dead addresses that hang until aborted, then a healthy one.
  const fetchImpl = (url, init) =>
    new URL(url).hostname.startsWith('dead')
      ? new Promise((_, reject) =>
          init.signal.addEventListener('abort', () =>
            reject(init.signal.reason)
          )
        )
      : good.fetchImpl(url, init);
  const started = Date.now();
  const { peers } = await readPeers({
    links: [
      {
        environment_id: 'env-t',
        label: 'Tailnet',
        secret_name: 'peer-link-t',
        urls_json: JSON.stringify([
          'https://dead-1.relay.test',
          'https://dead-2.relay.test',
          'https://dead-3.relay.test',
          'https://good.relay.test',
        ]),
        expires_at: FUTURE,
        fenced: 1,
      },
    ],
    secretsDir: dir,
    now: NOW,
    fetchImpl,
    deadlineMs: 6_000,
  });
  assert.equal(peers[0].live, true);
  assert.ok(Date.now() - started < 5_500);
});
