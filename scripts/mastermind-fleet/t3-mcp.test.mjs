import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  appendPrivateLine,
  readPrivateFile,
  writePrivateFile,
} from './private-files.mjs';
import {
  acquireMcpToken,
  connectLocalMcp,
  readCachedToken,
  readLocalOrigin,
  writeCachedToken,
} from './t3-mcp.mjs';
import { fakeServer, json, ORIGIN, tempDir } from './t3-test-fixture.mjs';

test('signs in over loopback with PKCE and always revokes the approving session', async () => {
  const server = fakeServer();
  const issued = await acquireMcpToken({
    origin: ORIGIN,
    sessions: server.sessions,
    fetchImpl: server.fetchImpl,
    now: () => 1_000,
  });
  assert.equal(issued.token, 'mcp-1');
  assert.equal(issued.expiresAt, new Date(3_601_000).toISOString());
  assert.deepEqual(server.sessions.revoked, ['sess-1']);
  assert.ok(server.sessions.issued[0].includes('access:write'));
  const find = (pathname) =>
    server.log.find((entry) => entry.pathname === pathname).body;
  const approval = find('/oauth/mcp/approval');
  const token = find('/oauth/mcp/token');
  assert.equal(approval.code_challenge_method, 'S256');
  assert.equal(approval.resource, `${ORIGIN}/mcp`);
  // The verifier sent for the token is the one the challenge committed to.
  assert.equal(
    createHash('sha256').update(token.code_verifier).digest('base64url'),
    approval.code_challenge
  );
  assert.ok(token.code_verifier.length >= 43);
  assert.equal(token.code, 'the-code');
  // The approving bearer goes to the approval and decision steps only.
  for (const entry of server.log)
    assert.equal(
      entry.headers.authorization === 'Bearer approver',
      ['/oauth/mcp/approval', '/oauth/mcp/decision'].includes(entry.pathname)
    );
});

test('refuses a non-loopback origin before any request', async () => {
  const server = fakeServer();
  for (const origin of [
    'https://example.com',
    'http://127.0.0.1.evil.test:80',
    'http://localhost:3773',
    'http://127.0.0.1:3773/x',
  ])
    await assert.rejects(
      acquireMcpToken({
        origin,
        sessions: server.sessions,
        fetchImpl: server.fetchImpl,
      }),
      { code: 't3_origin_not_loopback' }
    );
  assert.equal(server.log.length, 0);
  assert.equal(server.sessions.issued.length, 0);
});

test('fails closed and revokes when the session cannot approve', async () => {
  const narrow = fakeServer({ access: ['read-only'] });
  await assert.rejects(
    acquireMcpToken({
      origin: ORIGIN,
      sessions: narrow.sessions,
      fetchImpl: narrow.fetchImpl,
    }),
    { code: 't3_approval_unavailable' }
  );
  assert.deepEqual(narrow.sessions.revoked, ['sess-1']);
});

test('takes the code only from its own redirect path and its own state', async () => {
  const redirects = (authorization) => [
    // Right state, wrong path.
    `http://127.0.0.1/other?code=x&state=${authorization.state}`,
    // Right path, wrong state.
    `${authorization.redirect_uri}?code=x&state=wrong`,
    // Right path and state, no code.
    `${authorization.redirect_uri}?state=${authorization.state}`,
  ];
  for (const pick of [0, 1, 2]) {
    const server = fakeServer();
    const hijacked = async (url, init) =>
      new URL(url).pathname === '/oauth/mcp/decision'
        ? json({
            redirectTo: redirects(JSON.parse(init.body).authorization)[pick],
          })
        : server.fetchImpl(url, init);
    await assert.rejects(
      acquireMcpToken({
        origin: ORIGIN,
        sessions: server.sessions,
        fetchImpl: hijacked,
      }),
      { code: 't3_approval_denied' }
    );
    assert.deepEqual(server.sessions.revoked, ['sess-1']);
    assert.equal(server.state.minted, 0);
  }
});

test('token cache is private, origin-bound and expiry-aware', () => {
  const dir = tempDir();
  const file = path.join(dir, 'token.json');
  const value = {
    origin: ORIGIN,
    access: 'full-access',
    token: 'tok',
    expiresAt: new Date(10 * 60_000).toISOString(),
  };
  writeCachedToken(file, value);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(dir), ['token.json']);
  const want = { origin: ORIGIN, access: 'full-access', now: () => 0 };
  assert.equal(readCachedToken(file, want), 'tok');
  assert.equal(readCachedToken(file, { ...want, access: 'auto' }), null);
  assert.equal(
    readCachedToken(file, { ...want, origin: 'http://127.0.0.1:1' }),
    null
  );
  assert.equal(
    readCachedToken(file, { ...want, now: () => 9.5 * 60_000 }),
    null
  );
  fs.chmodSync(file, 0o644);
  assert.equal(readCachedToken(file, want), null);
  fs.rmSync(dir, { recursive: true });
});

test('private files never follow a symlink or block on a planted FIFO', () => {
  const dir = tempDir();
  const real = path.join(dir, 'real.json');
  fs.writeFileSync(real, 'keep', { mode: 0o600 });
  const link = path.join(dir, 'link.json');
  fs.symlinkSync(real, link);
  assert.equal(readPrivateFile(link), null);
  assert.throws(() => appendPrivateLine(link, 'x'));
  // Replacing a symlinked path replaces the link, never its target.
  writePrivateFile(link, 'new');
  assert.equal(fs.readFileSync(real, 'utf8'), 'keep');
  assert.equal(fs.lstatSync(link).isSymbolicLink(), false);
  assert.equal(readPrivateFile(link), 'new');

  const fifo = path.join(dir, 'fifo.json');
  execFileSync('mkfifo', [fifo]);
  const started = Date.now();
  assert.equal(readPrivateFile(fifo), null);
  assert.equal(
    readCachedToken(fifo, { origin: ORIGIN, access: 'full-access' }),
    null
  );
  assert.equal(readLocalOrigin(fifo), null);
  assert.ok(Date.now() - started < 1000);
  // A group-readable file is not private.
  const loose = path.join(dir, 'loose.json');
  fs.writeFileSync(loose, 'x', { mode: 0o640 });
  assert.equal(readPrivateFile(loose), null);
  assert.equal(readPrivateFile(loose, { privateMode: false }), 'x');
  assert.throws(() => appendPrivateLine(loose, 'y'), {
    message: 'private_file_unsafe',
  });
  fs.rmSync(dir, { recursive: true });
});

test('reads only a loopback origin from the runtime file', () => {
  const dir = tempDir();
  const file = path.join(dir, 'server-runtime.json');
  fs.writeFileSync(file, JSON.stringify({ origin: ORIGIN }));
  assert.equal(readLocalOrigin(file), ORIGIN);
  fs.writeFileSync(file, JSON.stringify({ origin: 'https://evil.test' }));
  assert.equal(readLocalOrigin(file), null);
  assert.equal(readLocalOrigin(path.join(dir, 'missing.json')), null);
  fs.rmSync(dir, { recursive: true });
});

test('reports a stopped server without signing in', async () => {
  const server = fakeServer();
  const home = tempDir('t3-home-');
  await assert.rejects(
    connectLocalMcp({
      home,
      fetchImpl: server.fetchImpl,
      sessions: server.sessions,
    }),
    { code: 't3_not_running' }
  );
  assert.equal(server.log.length, 0);
  fs.rmSync(home, { recursive: true });
});
