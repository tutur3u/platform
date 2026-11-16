import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { startLoopbackSession, validateActionLink } from './fleet-qa.mjs';
const projectRef = 'abcdefghijklmnopqrst';
const actionLink = `https://${projectRef}.supabase.co/auth/v1/verify?type=magiclink&token=synthetic&redirect_to=https%3A%2F%2Ftuturuuu.com%2Flogin`;
const headers = {
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-dest': 'document',
};
function consume(port, overrides = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: '/',
        method: 'GET',
        headers,
        ...overrides,
      },
      (res) => {
        res.resume();
        res.on('end', () =>
          resolve({ code: res.statusCode, headers: res.headers })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}
test('synthetic loopback redirects once, closes and never sets cookie', async () => {
  const s = await startLoopbackSession({ actionLink, projectRef });
  try {
    const r = await consume(s.port);
    assert.equal(r.code, 302);
    assert.equal(r.headers.location, actionLink);
    assert.equal(r.headers['set-cookie'], undefined);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(await s.closed, 'consumed');
    await assert.rejects(consume(s.port));
  } finally {
    s.stop();
  }
});
test('method, host, origin, cookie, fetch mode/site/dest and path fail closed and consume session', async () => {
  for (const overrides of [
    { method: 'POST' },
    { path: '/other' },
    { headers: { ...headers, host: 'attacker.example' } },
    { headers: { ...headers, origin: 'https://attacker.example' } },
    { headers: { ...headers, cookie: 'synthetic=value' } },
    { headers: { ...headers, 'sec-fetch-mode': 'cors' } },
    { headers: { ...headers, 'sec-fetch-site': 'cross-site' } },
    { headers: {} },
    { headers: { ...headers, authorization: 'synthetic' } },
    { headers: { ...headers, purpose: 'prefetch' } },
    { headers: { ...headers, 'sec-purpose': 'prefetch' } },
  ]) {
    const s = await startLoopbackSession({ actionLink, projectRef });
    try {
      const r = await consume(s.port, overrides);
      assert.equal(r.code, 403);
      assert.equal(r.headers.location, undefined);
      assert.equal(await s.closed, 'rejected');
      await assert.rejects(consume(s.port));
    } finally {
      s.stop();
    }
  }
});
test('TTL is bounded, closes incomplete sockets, and explicit stop cleans up', async () => {
  for (const ttlMs of [0, -1, 300001, Infinity])
    await assert.rejects(
      startLoopbackSession({ actionLink, projectRef, ttlMs })
    );
  const s = await startLoopbackSession({ actionLink, projectRef, ttlMs: 25 });
  const socket = connect(s.port, '127.0.0.1');
  socket.on('error', () => {});
  const disconnected = once(socket, 'close');
  assert.equal(await s.closed, 'expired');
  await disconnected;
  assert.equal(socket.destroyed, true);
  await assert.rejects(consume(s.port));
  const second = await startLoopbackSession({ actionLink, projectRef });
  second.stop();
  assert.equal(await second.closed, 'stopped');
});
test('malformed HTTP closes listener without link exposure', async () => {
  const s = await startLoopbackSession({ actionLink, projectRef });
  const socket = connect(s.port, '127.0.0.1', () =>
    socket.write('INVALID HTTP\r\n\r\n')
  );
  socket.on('error', () => {});
  assert.equal(await s.closed, 'rejected');
  socket.destroy();
  await assert.rejects(consume(s.port));
});
test('action target must be exact project, type, redirect and unique parameters', () => {
  for (const bad of [
    actionLink.replace(projectRef, 'wrong'),
    actionLink.replace('magiclink', 'signup'),
    actionLink.replace('%2Flogin', '%2Fother'),
    actionLink + '&type=magiclink',
    actionLink + '&extra=secret',
    actionLink + '#fragment',
    'bad',
  ])
    assert.throws(() => validateActionLink(bad, projectRef));
});
