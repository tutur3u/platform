import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  projectMeetServerFailure as projectWithinSignal,
  rejectMeetServerFailure,
} from './meet-native-response-diagnostics.mjs';

function projectMeetServerFailure(response, path, options = {}) {
  return projectWithinSignal(response, path, {
    signal: new AbortController().signal,
    ...options,
  });
}

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

for (const phase of ['read', 'cancel'])
  test(`existing abort budget returns a truthful record for stalled ${phase}`, async (t) => {
    const aborter = new AbortController();
    const cancellation = Promise.withResolvers();
    let controller,
      settled = false,
      fact;
    const response = new Response(
      new ReadableStream({
        start(c) {
          controller = c;
          if (phase === 'cancel') c.enqueue(new Uint8Array(65537));
        },
        cancel() {
          return cancellation.promise;
        },
      }),
      { status: 500 }
    );
    t.after(() => {
      cancellation.resolve();
      try {
        controller.close();
      } catch {}
    });
    const pending = projectMeetServerFailure(response, '/login', {
      signal: aborter.signal,
    }).then(
      (value) => {
        settled = true;
        fact = value;
      },
      () => {
        settled = true;
      }
    );
    await new Promise(setImmediate);
    assert.equal(settled, false);
    aborter.abort();
    await new Promise(setImmediate);
    assert.equal(
      settled,
      true,
      'diagnostic must return within the existing abort budget'
    );
    await pending;
    assert.equal(
      fact.drain,
      phase === 'read' ? 'incomplete' : 'cancel-unsettled'
    );
    assert.equal(fact.cancel, 'pending');
    assert.equal(fact.underlyingCancellation, 'UNKNOWN');
  });

for (const phase of ['read', 'cancel'])
  test(`actual stalled ${phase} retains HTTP500 primary and evidence across abort and late rejection`, async () => {
    const aborter = new AbortController(),
      cancellation = Promise.withResolvers();
    const primaries = [],
      records = [],
      unhandled = [];
    let settled = false,
      failure,
      cancelCalled = false;
    const onUnhandled = (error) => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);
    try {
      const response = new Response(
        new ReadableStream({
          start(c) {
            if (phase === 'cancel') c.enqueue(new Uint8Array(65537));
          },
          cancel() {
            cancelCalled = true;
            return cancellation.promise;
          },
        }),
        { status: 500 }
      );
      const pending = rejectMeetServerFailure(
        response,
        '/login?token=DO_NOT_RETAIN',
        {
          signal: aborter.signal,
          recordPrimary: (error) => primaries.push(error),
          recordFact: (fact) => records.push(fact),
        }
      ).then(
        () => {
          settled = true;
        },
        (error) => {
          failure = error;
          settled = true;
        }
      );
      assert.equal(
        primaries.length,
        1,
        'HTTP500 primary registered before body work'
      );
      assert.equal(primaries[0].actual, 500);
      assert.equal(
        records.length,
        1,
        'diagnostic record exists before awaiting body'
      );
      await new Promise(setImmediate);
      assert.equal(settled, false);
      aborter.abort();
      assert.equal(
        records[0].drain,
        phase === 'read' ? 'incomplete' : 'cancel-unsettled',
        'abort updates evidence synchronously'
      );
      await new Promise(setImmediate);
      assert.equal(
        settled,
        true,
        'expired existing budget must not await read/cancel'
      );
      await pending;
      assert.equal(failure, primaries[0]);
      assert.equal(cancelCalled, true);
      assert.equal(records[0].cancel, 'pending');
      assert.equal(records[0].underlyingCancellation, 'UNKNOWN');
      cancellation.reject(new Error('DO_NOT_RETAIN_LATE_ERROR'));
      await new Promise(setImmediate);
      assert.deepEqual(unhandled, []);
      assert.equal(
        records[0].cancel,
        'pending',
        'later detached settlement cannot rewrite retained observations'
      );
      assert.equal(JSON.stringify(records).includes('DO_NOT_RETAIN'), false);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });

test('HTTP500 remains primary when cancellation rejects within the existing budget', async () => {
  const primary = [],
    records = [];
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(65537));
      },
      cancel() {
        return Promise.reject(new Error('DO_NOT_RETAIN'));
      },
    }),
    { status: 500 }
  );
  await assert.rejects(
    rejectMeetServerFailure(response, '/login', {
      signal: new AbortController().signal,
      recordPrimary: (error) => primary.push(error),
      recordFact: (fact) => records.push(fact),
    }),
    (error) => error === primary[0] && error.actual === 500
  );
  assert.equal(records[0].drain, 'failed');
  assert.equal(records[0].cancel, 'rejected');
  assert.equal(records[0].underlyingCancellation, 'UNKNOWN');
});

test('missing caller budget fails diagnostic closed while preserving the HTTP500 assertion', async () => {
  const primary = [],
    records = [];
  await assert.rejects(
    rejectMeetServerFailure(
      new Response('private', { status: 500 }),
      '/login',
      {
        recordPrimary: (error) => primary.push(error),
        recordFact: (fact) => records.push(fact),
      }
    ),
    (error) => error === primary[0] && error.actual === 500
  );
  assert.equal(records[0].category, 'diagnostic-unavailable');
  assert.equal(records[0].underlyingCancellation, 'UNKNOWN');
});
