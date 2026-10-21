import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectMeetServerFailure } from './meet-native-response-diagnostics.mjs';

test('500 diagnostics wait for EOF and retain only closed response/error categories', async () => {
  let controller,
    settled = false;
  const response = new Response(
    new ReadableStream({
      start(c) {
        controller = c;
      },
    }),
    {
      status: 500,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'DO_NOT_RETAIN_SECRET=value',
      },
    }
  );
  const pending = projectMeetServerFailure(
    response,
    '/vi/login?token=DO_NOT_RETAIN_SECRET'
  ).then((fact) => {
    settled = true;
    return fact;
  });
  controller.enqueue(
    new TextEncoder().encode(
      JSON.stringify({
        message: 'Meet request context is unavailable DO_NOT_RETAIN_SECRET',
        stack:
          'TypeError: DO_NOT_RETAIN_SECRET\n at LoginPage (/private/secret:1:2)',
      })
    )
  );
  await new Promise(setImmediate);
  assert.equal(settled, false);
  controller.close();
  const fact = await pending;
  assert.equal(response.bodyUsed, true);
  assert.equal(fact.drain, 'complete');
  assert.equal(fact.route, 'login');
  assert.equal(fact.format, 'json');
  assert.equal(fact.category, 'request-context');
  assert.deepEqual(fact.owners, ['LoginPage']);
  const serialized = JSON.stringify(fact);
  for (const value of [
    'DO_NOT_RETAIN_SECRET',
    '/private/secret',
    'set-cookie',
    'token=',
  ])
    assert.equal(serialized.includes(value), false);
});

test('unknown HTML500 drains without inventing a cause or retaining bytes', async () => {
  const fact = await projectMeetServerFailure(
    new Response('<html>DO_NOT_RETAIN_SECRET</html>', {
      status: 500,
      headers: { 'content-type': 'text/html' },
    }),
    '/verify-token'
  );
  assert.equal(fact.category, 'UNKNOWN');
  assert.equal(fact.drain, 'complete');
  assert.equal(fact.format, 'html');
  assert.deepEqual(fact.owners, []);
  assert.equal(JSON.stringify(fact).includes('DO_NOT_RETAIN_SECRET'), false);
});

test('oversize diagnostic body is bounded, cancelled, and never called fully drained', async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(65537));
      },
      cancel() {
        cancelled = true;
      },
    }),
    { status: 500 }
  );
  const fact = await projectMeetServerFailure(response, '/other');
  assert.equal(cancelled, true);
  assert.equal(fact.truncated, true);
  assert.equal(fact.drain, 'cancelled');
  assert.ok(fact.bytes <= 65536);
});

test('failed body reads retain only a failure category', async () => {
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.error(new Error('DO_NOT_RETAIN_SECRET'));
      },
    }),
    { status: 500 }
  );
  const fact = await projectMeetServerFailure(response, '/login');
  assert.equal(fact.drain, 'failed');
  assert.equal(JSON.stringify(fact).includes('DO_NOT_RETAIN_SECRET'), false);
});

test('diagnostics never consume or reinterpret a non500 response', async () => {
  const response = new Response('exact success', { status: 200 });
  await assert.rejects(
    projectMeetServerFailure(response, '/login'),
    /Only HTTP500/
  );
  assert.equal(response.bodyUsed, false);
  assert.equal(await response.text(), 'exact success');
});
