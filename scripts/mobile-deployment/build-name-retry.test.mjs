import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { appleGet, listIosPrereleaseVersionRecords } from './build-name.mjs';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const credentials = {
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  keyId: 'test-key',
  issuerId: 'test-issuer',
};

async function withFetch(sequence, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const value = sequence[calls.length - 1];
    if (value instanceof Error) throw value;
    assert.ok(value, 'unexpected extra request');
    return value;
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

for (const first of [
  new DOMException('slow request', 'TimeoutError'),
  new TypeError('fetch failed'),
  new Response(null, { status: 429 }),
  new Response(null, { status: 503 }),
]) {
  test(`retries ${first.name ?? first.status} then returns the successful body`, async () => {
    const pauses = [];
    await withFetch(
      [first, Response.json({ data: ['ready'] })],
      async (calls) => {
        const result = await appleGet('/v1/apps', credentials, {
          sleep: async (ms) => pauses.push(ms),
        });
        assert.deepEqual(result, { data: ['ready'] });
        assert.equal(calls.length, 2);
        assert.deepEqual(pauses, [5_000]);
        assert.equal(calls[0].options.redirect, 'error');
        assert.ok(calls[0].options.signal instanceof AbortSignal);
      }
    );
  });
}

test('exhausted timeouts fail closed after three requests with bounded backoff', async () => {
  const pauses = [];
  const failures = Array.from(
    { length: 3 },
    () => new DOMException('slow request', 'TimeoutError')
  );
  await withFetch(failures, async (calls) => {
    await assert.rejects(
      appleGet('/v1/apps', credentials, {
        sleep: async (ms) => pauses.push(ms),
      }),
      { name: 'TimeoutError' }
    );
    assert.equal(calls.length, 3);
    assert.deepEqual(pauses, [5_000, 15_000]);
  });
});

for (const status of [400, 401, 403, 404]) {
  test(`HTTP ${status} fails immediately without retry or backoff`, async () => {
    await withFetch([new Response(null, { status })], async (calls) => {
      await assert.rejects(
        appleGet('/v1/apps', credentials, {
          sleep: async () => assert.fail('must not back off'),
        }),
        new RegExp(`lookup failed \\(${status}\\)`)
      );
      assert.equal(calls.length, 1);
    });
  });
}

test('the overall deadline aborts backoff and prevents another request', async () => {
  const controller = new AbortController();
  await withFetch([new TypeError('network unavailable')], async (calls) => {
    await assert.rejects(
      appleGet('/v1/apps', credentials, {
        signal: controller.signal,
        sleep: async (_ms, _value, { signal }) => {
          assert.equal(signal, controller.signal);
          controller.abort(
            new DOMException('overall deadline', 'TimeoutError')
          );
        },
      }),
      { name: 'TimeoutError' }
    );
    assert.equal(calls.length, 1);
  });
});

test('pagination shares the original deadline instead of starting a new one', async () => {
  const controller = new AbortController();
  const page = Response.json({
    data: [],
    links: {
      next: 'https://api.appstoreconnect.apple.com/v1/preReleaseVersions?page=2',
    },
  });
  const readPage = page.json.bind(page);
  page.json = async () => {
    const body = await readPage();
    controller.abort(new DOMException('overall deadline', 'TimeoutError'));
    return body;
  };
  await withFetch(
    [Response.json({ data: [{ id: 'app-id' }] }), page],
    async (calls) => {
      await assert.rejects(
        listIosPrereleaseVersionRecords(credentials, {
          signal: controller.signal,
        }),
        { name: 'TimeoutError' }
      );
      assert.equal(calls.length, 2);
    }
  );
});

test('response-body network errors retry without treating HTTP 200 as terminal', async () => {
  const broken = Response.json({ data: [] });
  broken.json = async () => {
    throw new TypeError('body stream failed');
  };
  await withFetch(
    [broken, Response.json({ data: ['ready'] })],
    async (calls) => {
      const body = await appleGet('/v1/apps', credentials, {
        sleep: async () => {},
      });
      assert.deepEqual(body, { data: ['ready'] });
      assert.equal(calls.length, 2);
    }
  );
});

test('invalid JSON fails immediately instead of retrying a protocol error', async () => {
  await withFetch([new Response('not JSON')], async (calls) => {
    await assert.rejects(appleGet('/v1/apps', credentials), SyntaxError);
    assert.equal(calls.length, 1);
  });
});

test('each request has a 60-second timeout under one four-minute deadline', async (t) => {
  const original = AbortSignal.timeout;
  const timeouts = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    timeouts.push(ms);
    return original(ms);
  });
  await withFetch([Response.json({ data: [] })], async () => {
    await appleGet('/v1/apps', credentials);
    assert.deepEqual(timeouts, [240_000, 60_000]);
  });
});
