import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {
  assertHostOverrideAllowed,
  compare,
  nodeRequest,
  probe,
} from './redirect-parity.mjs';

function fakeRequest(answers) {
  const seen = [];
  const request = async (url, headers) => {
    seen.push({ url, headers });
    return answers[url] ?? { status: 200, location: null };
  };
  return { request, seen };
}

test('encodes each segment and sends no cookies', async () => {
  const { request, seen } = fakeRequest({
    'https://a.example/meet/Ab%20c': { status: 307, location: 'https://x' },
  });
  assert.deepEqual(await probe('https://a.example/', 'meet/Ab c', request), {
    status: 307,
    location: 'https://x',
  });
  assert.equal(seen[0].headers.cookie, undefined);
});

test('flags status or Location differences', async () => {
  const { request } = fakeRequest({
    'https://old.example/abc': { status: 307, location: 'https://dest/' },
    'https://new.example/abc': { status: 307, location: 'https://dest/' },
    'https://old.example/gone': { status: 200, location: null },
    'https://new.example/gone': { status: 404, location: null },
  });
  const rows = await compare({
    baseline: 'https://old.example',
    candidate: 'https://new.example',
    slugs: ['abc', 'gone'],
    request,
  });
  assert.deepEqual(
    rows.map((row) => [row.slug, row.ok]),
    [
      ['abc', true],
      ['gone', false],
    ]
  );
});

test('refuses a Host override for remote candidates', () => {
  assert.throws(
    () => assertHostOverrideAllowed('https://x.workers.dev', 'ttr.gg'),
    /loopback/
  );
  assert.doesNotThrow(() =>
    assertHostOverrideAllowed('http://127.0.0.1:8787', 'ttr.gg')
  );
  assert.doesNotThrow(() => assertHostOverrideAllowed('https://x.dev'));
  for (const candidate of ['http://localhost:3002', 'http://[::1]:8787'])
    assert.doesNotThrow(() => assertHostOverrideAllowed(candidate, 'ttr.gg'));
});

test('delivers the Host override to a loopback server without following redirects', async (t) => {
  const hosts = [];
  const server = http.createServer((request, response) => {
    hosts.push(request.headers.host);
    response.writeHead(307, { location: 'https://dest.example/' });
    response.end('moved');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const answer = await probe(`http://127.0.0.1:${port}`, 'abc', nodeRequest, {
    host: 'ttr.gg',
  });
  assert.deepEqual(answer, { status: 307, location: 'https://dest.example/' });
  assert.deepEqual(hosts, ['ttr.gg']);
});
