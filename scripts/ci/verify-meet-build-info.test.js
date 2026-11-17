const assert = require('node:assert/strict');
const test = require('node:test');
const {
  BUILD_INFO_URL,
  PROBE_WINDOW_MS,
  RETRY_DELAYS_SECONDS,
  main,
  requestBuildInfo,
  verifyMeetBuildInfo,
} = require('./verify-meet-build-info');
const sha = 'a'.repeat(40);
const metadata = {
  appName: 'meet',
  commitHash: sha,
  environment: 'production',
  refName: 'production',
};
const verify = (value) =>
  verifyMeetBuildInfo({ sha, status: 200, body: JSON.stringify(value) });

test('accepts only the exact canonical Meet production candidate', () => {
  assert.doesNotThrow(() => verify(metadata));
  for (const change of [
    { commitHash: 'local' },
    { commitHash: 'b'.repeat(40) },
    { appName: 'web' },
    { environment: 'preview' },
    { refName: 'main' },
  ])
    assert.throws(() => verify({ ...metadata, ...change }), /does not match/);
});
test('fails closed for missing, malformed or non-JSON metadata without echoing bodies', () => {
  for (const value of [null, {}, [], 'private response'])
    assert.throws(() => verify(value), /does not match/);
  assert.throws(
    () => verifyMeetBuildInfo({ sha, status: 200, body: 'private response' }),
    /^Error: Meet build identity probe expected JSON$/
  );
  for (const status of [301, 404, 503])
    assert.throws(
      () => verifyMeetBuildInfo({ sha, status, body: '{}' }),
      /HTTP probe failed/
    );
});
test('rejects invalid candidate SHA before requesting the canonical endpoint', async () => {
  let requests = 0;
  await assert.rejects(
    main({
      env: { GITHUB_SHA: 'local' },
      request: () => {
        requests++;
      },
    }),
    /full source SHA/
  );
  assert.equal(requests, 0);
});
test('CLI admission passes its expected SHA to response verification', async () => {
  await assert.rejects(
    main({
      env: { GITHUB_SHA: sha },
      request: () => ({
        status: 200,
        body: JSON.stringify({ ...metadata, commitHash: 'b'.repeat(40) }),
      }),
    }),
    /does not match/
  );
});

test('canonical probe is bounded, credential-free and preserves HTTP status', () => {
  const result = requestBuildInfo((command, args, options) => {
    assert.equal(command, 'curl');
    assert.equal(args.at(-1), `${BUILD_INFO_URL}?ttr_probe=0`);
    assert.ok(!args.includes('--location'));
    assert.ok(!args.includes('--header'));
    assert.ok(args.includes('--max-time'));
    assert.equal(options.maxBuffer, 64 * 1024);
    assert.equal(options.timeout, 25000);
    return '{}\nTTR_HTTP_STATUS:503';
  });
  assert.deepEqual(result, { status: 503, body: '{}', headers: {} });
  assert.throws(
    () =>
      requestBuildInfo(() => {
        throw new Error('private transport response');
      }),
    /^Error: Meet canonical build identity probe could not complete$/
  );
  assert.throws(
    () => requestBuildInfo(() => 'private malformed response'),
    /^Error: Meet canonical build identity probe could not complete$/
  );
});

test('probe varies the cache-busting query and keeps only allowlisted headers', () => {
  const raw = [
    'HTTP/2 200',
    'cf-ray: 9abc-SIN',
    'cf-cache-status: DYNAMIC',
    'age: 0',
    'date: Tue, 17 Nov 2026 18:54:19 GMT',
    'cache-control: no-store, max-age=0',
    'set-cookie: session=private-cookie',
    'authorization: Bearer private-token',
    '',
    '{"ok":true}',
    'TTR_HTTP_STATUS:200',
  ].join('\r\n');
  const result = requestBuildInfo((_command, args) => {
    assert.equal(args.at(-1), `${BUILD_INFO_URL}?ttr_probe=7`);
    return raw.replace('\r\nTTR_HTTP_STATUS', '\nTTR_HTTP_STATUS');
  }, 7);
  assert.equal(result.status, 200);
  assert.equal(result.body, '{"ok":true}');
  assert.deepEqual(result.headers, {
    'cf-ray': '9abc-SIN',
    'cf-cache-status': 'DYNAMIC',
    age: '0',
    date: 'Tue, 17 Nov 2026 18:54:19 GMT',
    'cache-control': 'no-store, max-age=0',
  });
});

const previous = 'c'.repeat(40);
const response = (value) => ({
  status: 200,
  body: JSON.stringify(value),
  headers: { 'cf-ray': 'ray' },
});
const harness = (responses, { clock = { t: 0 } } = {}) => {
  const slept = [];
  const logs = [];
  let index = 0;
  return {
    slept,
    logs,
    options: {
      env: { GITHUB_SHA: sha, MEET_PREVIOUS_LIVE_SHA: previous },
      request: (_command, attempt) => {
        assert.equal(attempt, index);
        return responses[Math.min(index++, responses.length - 1)];
      },
      sleep: async (seconds) => {
        slept.push(seconds);
        clock.t += seconds * 1000;
      },
      now: () => clock.t,
      log: (line) => logs.push(line),
    },
    count: () => index,
  };
};

test('keeps the final header block when an interim response precedes it', () => {
  const raw = [
    'HTTP/2 103',
    'cf-ray: interim',
    '',
    'HTTP/2 200',
    'cf-ray: final',
    '',
    '{"ok":true}\nTTR_HTTP_STATUS:200',
  ].join('\r\n');
  const result = requestBuildInfo(() =>
    raw.replace('\r\nTTR_HTTP_STATUS', '\nTTR_HTTP_STATUS')
  );
  assert.equal(result.body, '{"ok":true}');
  assert.deepEqual(result.headers, { 'cf-ray': 'final' });
});

test('retry window is bounded to about two minutes', () => {
  const total = RETRY_DELAYS_SECONDS.reduce((a, b) => a + b, 0) * 1000;
  assert.ok(total >= 90_000 && total <= PROBE_WINDOW_MS);
});

test('polls past the previous live commit until the candidate is served', async () => {
  const h = harness([
    response({ ...metadata, commitHash: previous }),
    response({ ...metadata, commitHash: previous }),
    response(metadata),
  ]);
  await main(h.options);
  assert.equal(h.count(), 3);
  assert.deepEqual(h.slept, RETRY_DELAYS_SECONDS.slice(0, 2));
  assert.match(h.logs[0], /attempt 1: pending/);
  assert.match(h.logs[0], /cf-ray/);
  assert.match(h.logs[2], /attempt 3: verified/);
});

test('fails strictly once the window expires on the previous live commit', async () => {
  const h = harness([response({ ...metadata, commitHash: previous })]);
  await assert.rejects(
    main(h.options),
    /previous live commit after the propagation window/
  );
  assert.equal(h.count(), RETRY_DELAYS_SECONDS.length + 1);
  assert.ok(h.slept.reduce((a, b) => a + b, 0) * 1000 <= PROBE_WINDOW_MS);
});

test('any other mismatch fails on the first attempt without waiting', async () => {
  for (const change of [
    { commitHash: 'b'.repeat(40) },
    { appName: 'web' },
    { environment: 'preview' },
    { refName: 'main' },
    { appName: 'web', commitHash: previous },
    { environment: 'preview', commitHash: previous },
    { refName: 'main', commitHash: previous },
  ]) {
    const h = harness([response({ ...metadata, ...change })]);
    await assert.rejects(main(h.options), /does not match/);
    assert.equal(h.count(), 1);
    assert.deepEqual(h.slept, []);
  }
});

test('non-200 and transport failures are not retried', async () => {
  const h = harness([{ status: 503, body: '{}', headers: {} }]);
  await assert.rejects(main(h.options), /HTTP probe failed/);
  assert.equal(h.count(), 1);
});

test('without a valid previous live commit the check stays single-attempt strict', async () => {
  for (const MEET_PREVIOUS_LIVE_SHA of [undefined, '', 'local', sha]) {
    const h = harness([response({ ...metadata, commitHash: previous })]);
    h.options.env = { GITHUB_SHA: sha, MEET_PREVIOUS_LIVE_SHA };
    await assert.rejects(main(h.options), /does not match/);
    assert.equal(h.count(), 1);
  }
});

test('reports only a validated numeric failure status without private response content', () => {
  for (const status of [401, 403, 429, 503]) {
    assert.throws(
      () =>
        verifyMeetBuildInfo({
          sha,
          status,
          body: 'synthetic private response',
        }),
      { message: `Meet build identity HTTP probe failed (status ${status})` }
    );
  }
  for (const status of ['403 synthetic-private', NaN, 0, 999, {}, undefined]) {
    assert.throws(
      () =>
        verifyMeetBuildInfo({
          sha,
          status,
          body: 'synthetic private response',
        }),
      /^Error: Meet build identity HTTP probe failed \(status unavailable\)$/
    );
  }
});

test('identity mismatch reports only allowlisted fields and valid source hashes', () => {
  const modifiedMetadata = {
    ...metadata,
    commitHash: 'b'.repeat(40),
    refName: 'main',
  };
  assert.throws(
    () => verify(modifiedMetadata),
    (error) => {
      const diagnostic = JSON.parse(error.message.split(': ')[1]);
      assert.deepEqual(diagnostic.expected, metadata);
      assert.deepEqual(diagnostic.observed, modifiedMetadata);
      assert.deepEqual(diagnostic.mismatches, ['commitHash', 'refName']);
      return true;
    }
  );
  for (const value of [
    'private-response\nsecret',
    { secret: 'private-response' },
    null,
  ]) {
    assert.throws(
      () =>
        verify({
          appName: value,
          commitHash: value,
          environment: value,
          refName: value,
          token: 'private-response',
        }),
      (error) => {
        assert.doesNotMatch(error.message, /private-response|secret|token/);
        const diagnostic = JSON.parse(error.message.split(': ')[1]);
        assert.deepEqual(
          Object.values(diagnostic.observed),
          Array(4).fill('unrecognized')
        );
        assert.deepEqual(diagnostic.mismatches, Object.keys(metadata));
        return true;
      }
    );
  }
});
