import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './worker.mjs';

test('all paths and methods return the bounded bilingual maintenance response', async () => {
  for (const path of [
    '/',
    '/vi',
    '/api/v1/hive/servers',
    '/realtime',
    '/?q=%3Cscript%3E',
  ]) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
      const response = worker.fetch(
        new Request(`https://hive.tuturuuu.com${path}`, { method })
      );
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Retry-After'), '300');
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.get('Content-Language'), 'en, vi');
      assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
      assert.equal(response.headers.get('X-Hive-Maintenance'), '1');
      const html = await response.text();
      if (method === 'HEAD') {
        assert.equal(html, '');
      } else {
        assert.match(html, /Hive is under maintenance/);
        assert.match(html, /Hive đang bảo trì/);
        assert.match(html, /lang="vi"/);
        assert.doesNotMatch(
          html,
          /<script|https?:\/\/|<meta[^>]+http-equiv|<img|<iframe/
        );
        assert.ok(Buffer.byteLength(html) < 4096);
      }
    }
  }
});

test('a WebSocket handshake receives HTTP 503 without opening a socket', async () => {
  const response = worker.fetch(
    new Request('https://hive.tuturuuu.com/realtime', {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
    })
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Upgrade'), null);
  assert.match(await response.text(), /Hive đang bảo trì/);
});

test('request input is never reflected and no external work is scheduled', async () => {
  const deny = () => {
    throw new Error('Unexpected external work');
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = deny;
  try {
    const request = new Request(
      'https://hive.tuturuuu.com/?secret=untrusted-sentinel',
      {
        method: 'POST',
        body: 'untrusted-sentinel',
      }
    );
    const response = worker.fetch(request, new Proxy({}, { get: deny }), {
      waitUntil: deny,
    });
    assert.doesNotMatch(await response.text(), /untrusted-sentinel/);
    assert.equal(request.bodyUsed, false);
    assert.match(
      response.headers.get('Content-Security-Policy'),
      /default-src 'none'/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
