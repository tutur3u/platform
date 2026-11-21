import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  baseFleetState,
  readRelease,
  readResolved,
  safeLoginUrl,
} from './decision-extras.mjs';
import { parseDecision } from './publish.mjs';

const NOW = new Date('2026-11-20T03:00:00.000Z');
const base = {
  id: 'gh-devbox-login',
  title: 'GitHub sign-in on Devbox',
  urgency: 'high',
  createdAt: '2026-11-20T02:59:00.000Z',
};
const login = {
  service: 'github',
  flow: 'device',
  url: 'https://github.com/login/device',
  userCode: 'abcd-1234',
  expiresAt: '2026-11-20T03:15:00.000Z',
};

test('a login decision keeps its validated payload and context', () => {
  const decision = parseDecision(
    {
      ...base,
      kind: 'login',
      why: 'Release bot needs repo scope',
      requester: 'release-bot-signoff',
      login,
    },
    NOW
  );
  assert.equal(decision.kind, 'login');
  assert.equal(decision.why, 'Release bot needs repo scope');
  assert.deepEqual(decision.login, {
    service: 'github',
    flow: 'device',
    state: 'waiting',
    expiresAt: '2026-11-20T03:15:00.000Z',
    url: 'https://github.com/login/device',
    userCode: 'ABCD-1234',
  });
});

test('an unsafe or incomplete login request is dropped, not published', () => {
  for (const bad of [
    { ...login, url: 'https://github.evil.example/login/device' },
    { ...login, url: 'http://github.com/login/device' },
    { ...login, userCode: undefined },
    { ...login, service: 'unknown' },
  ])
    assert.equal(
      parseDecision({ ...base, kind: 'login', login: bad }, NOW),
      null
    );
  assert.equal(parseDecision({ ...base, kind: 'login' }, NOW), null);
  assert.equal(parseDecision({ ...base, kind: 'poll' }, NOW), null);
});

test('an expired login drops its link and code', () => {
  const decision = parseDecision(
    {
      ...base,
      kind: 'login',
      login: { ...login, expiresAt: '2026-11-20T02:00:00.000Z' },
    },
    NOW
  );
  assert.equal(decision.login.state, 'expired');
  assert.equal(decision.login.url, undefined);
  assert.equal(decision.login.userCode, undefined);
});

test('plain asks are unchanged', () => {
  const decision = parseDecision(base, NOW);
  assert.equal(decision.kind, undefined);
  assert.equal(decision.login, undefined);
});

test('resolved history keeps the last day, newest first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-resolved-'));
  const write = (name, value) =>
    fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  write('a.json', {
    id: 'a',
    title: 'Old',
    resolvedAt: '2026-11-18T00:00:00.000Z',
  });
  write('b.json', {
    id: 'b',
    title: 'Retire cron?',
    answeredVia: 'whatsapp',
    outcome: 'Retire it',
    resolvedAt: '2026-11-20T02:50:00.000Z',
  });
  write('c.json', {
    id: 'c',
    title: 'Newer',
    answeredVia: 'carrier-pigeon',
    resolvedAt: '2026-11-20T02:55:00.000Z',
  });
  write('bad.json', '{');
  const resolved = readResolved(dir, NOW);
  assert.deepEqual(
    resolved.map((r) => r.id),
    ['c', 'b']
  );
  assert.equal(resolved[0].answeredVia, undefined);
  assert.equal(resolved[1].answeredVia, 'whatsapp');
});

test('release status is read tolerantly and absent when invalid', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-release-'));
  const file = path.join(dir, 'release.json');
  assert.equal(readRelease(file), undefined);
  fs.writeFileSync(file, JSON.stringify({ main: { state: 'melting' } }));
  assert.equal(readRelease(file), undefined);
  fs.writeFileSync(
    file,
    JSON.stringify({
      main: { state: 'frozen', reason: 'Release train', queued: 3 },
      production: { state: 'weird', sha: 'not-a-sha' },
      migrations: { pending: 1, state: 'gated' },
      incidents: [
        {
          id: 'cal-errors',
          title: 'Calendar errors',
          severity: 'high',
          openedAt: '2026-11-20T02:10:00.000Z',
        },
        { id: 'Bad Id', title: 'x', openedAt: '2026-11-20T02:10:00.000Z' },
      ],
    })
  );
  assert.deepEqual(readRelease(file), {
    main: { state: 'frozen', reason: 'Release train', queued: 3 },
    production: { state: 'unknown' },
    migrations: { pending: 1, state: 'gated' },
    incidents: [
      {
        id: 'cal-errors',
        title: 'Calendar errors',
        severity: 'high',
        openedAt: '2026-11-20T02:10:00.000Z',
      },
    ],
  });
});

test('an open login needs an expiry within a day', () => {
  const { expiresAt: _drop, ...noExpiry } = login;
  assert.equal(
    parseDecision({ ...base, kind: 'login', login: noExpiry }, NOW),
    null
  );
  assert.equal(
    parseDecision(
      {
        ...base,
        kind: 'login',
        login: { ...login, expiresAt: '2026-11-22T03:00:00.000Z' },
      },
      NOW
    ),
    null
  );
});

test('login links return OAuth codes only to the agent or the provider', () => {
  const authorize = (redirect) =>
    `https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=abc${
      redirect ? `&redirect_uri=${encodeURIComponent(redirect)}` : ''
    }`;
  assert.ok(
    safeLoginUrl(
      'cloudflare',
      authorize('http://localhost:8976/oauth/callback'),
      'local_callback'
    )
  );
  // Loopback only completes on the agent's machine.
  assert.equal(
    safeLoginUrl(
      'cloudflare',
      authorize('http://localhost:8976/oauth/callback')
    ),
    null
  );
  assert.ok(
    safeLoginUrl('cloudflare', authorize('https://dash.cloudflare.com/cb'))
  );
  assert.equal(
    safeLoginUrl('cloudflare', authorize('https://evil.example/cb')),
    null
  );
  assert.equal(
    safeLoginUrl('cloudflare', authorize('http://evil.example/cb')),
    null
  );
  assert.equal(safeLoginUrl('cloudflare', authorize()), null);
  assert.equal(
    safeLoginUrl('github', 'https://github.com/login/device?x=1', 'device'),
    null
  );
  assert.equal(
    safeLoginUrl('github', 'https://github.com/login/device#x'),
    null
  );
});

test('the v1 core drops every addition and login requests', () => {
  const state = {
    version: 1,
    decisions: [
      { id: 'a', title: 'A', why: 'w', kind: 'ask' },
      { id: 'b', title: 'B', kind: 'login', login: {} },
    ],
    resolved: [],
    release: { main: { state: 'open' } },
  };
  assert.deepEqual(baseFleetState(state), {
    version: 1,
    decisions: [{ id: 'a', title: 'A' }],
  });
  const plain = { version: 1, decisions: [{ id: 'a', title: 'A' }] };
  assert.equal(baseFleetState(plain), plain);
});

test('login links refuse duplicate OAuth parameters and oversized output', () => {
  const dup =
    'https://dash.cloudflare.com/oauth2/auth?client_id=a&redirect_uri=http%3A%2F%2Flocalhost%3A1%2Fcb&redirect_uri=https%3A%2F%2Fevil.example%2Fcb';
  assert.equal(safeLoginUrl('cloudflare', dup), null);
  // 600 raw characters that percent-encode past the 2,048 limit.
  const wide = `https://github.com/login/${'\u00e9'.repeat(600)}`;
  assert.ok(wide.length < 2048);
  assert.equal(safeLoginUrl('github', wide), null);
});

test('a resolved path that is not a directory yields no history', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-resolved-file-'));
  const file = path.join(dir, 'resolved');
  fs.writeFileSync(file, 'x');
  assert.deepEqual(readResolved(file, NOW), []);
});

test('resolved history scans only the most recently written files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-resolved-many-'));
  for (let i = 0; i < 130; i++) {
    const file = path.join(dir, `d${i}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({
        id: `d${i}`,
        title: 'Done',
        resolvedAt: '2026-11-20T02:00:00.000Z',
      })
    );
    const at = new Date(NOW.getTime() - (130 - i) * 1000);
    fs.utimesSync(file, at, at);
  }
  const resolved = readResolved(dir, NOW);
  assert.equal(resolved.length, 20);
});
