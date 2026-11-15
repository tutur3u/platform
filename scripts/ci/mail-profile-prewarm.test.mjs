import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertProfilePrewarmedResult,
  prewarmProfileRoute,
  PROFILE_PREWARM_MARKER,
  PROFILE_PREWARM_TIMEOUT_MS,
  profilePrewarmDiagnostics,
} from './mail-profile-prewarm.mjs';
import { summarizeBrowserResults } from './mail-profile-result-summary.mjs';

const origin = 'http://localhost:7833';
const workspace = '11111111-2222-3333-4444-555555555555';
const sentinel = 'PRIVATE_TOKEN_URL_BODY_ERROR';
function fixture(patch = {}) {
  const calls = [];
  const lines = [];
  const response = {
    status: () => 200,
    headers: () => ({ 'content-type': 'text/html; charset=utf-8' }),
    body: async () => Buffer.from('<!doctype html><html></html>'),
    dispose: async () => calls.push('dispose'),
    ...patch,
  };
  return {
    calls,
    lines,
    response,
    request: {
      get: async (url, options) => {
        calls.push({ url, options });
        return response;
      },
    },
    options: { emit: (line) => lines.push(line), now: () => 10 },
  };
}
const result = (lines) => ({
  retry: 0,
  stdout: lines.map((text) => ({ text })),
});

test('one no-follow request waits for the full HTML body and disposes it', async () => {
  let finishBody;
  const pending = new Promise((resolve) => {
    finishBody = resolve;
  });
  const f = fixture({ body: () => pending });
  let completed = false;
  const running = prewarmProfileRoute(
    f.request,
    origin,
    workspace,
    f.options
  ).then((value) => {
    completed = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0], {
    url: `${origin}/${workspace}/profile`,
    options: { maxRedirects: 0, maxRetries: 0, timeout: 60000 },
  });
  finishBody(Buffer.from('<html>owned synthetic profile</html>'));
  const receipt = await running;
  assert.equal(PROFILE_PREWARM_TIMEOUT_MS, 60000);
  assert.equal(receipt.responseComplete, true);
  assert.equal(receipt.responseDisposed, true);
  assert.deepEqual(f.calls.slice(1), ['dispose']);
  assert.doesNotThrow(() => assertProfilePrewarmedResult(result(f.lines)));
  assert.equal(
    profilePrewarmDiagnostics(result(f.lines)).record.outcome,
    'passed'
  );
});

test('redirects and auth/server errors fail once without following or exposing a body', async () => {
  for (const status of [301, 302, 307, 308, 401, 403, 500]) {
    const f = fixture({
      status: () => status,
      body: async () => {
        throw new Error(sentinel);
      },
    });
    await assert.rejects(
      prewarmProfileRoute(f.request, origin, workspace, f.options),
      /\(status\)/u
    );
    assert.equal(f.calls.filter((call) => call !== 'dispose').length, 1);
    assert.deepEqual(f.calls.slice(1), ['dispose']);
    assert.doesNotMatch(f.lines.join(''), new RegExp(sentinel, 'u'));
    assert.throws(() => assertProfilePrewarmedResult(result(f.lines)));
  }
});

test('a bare 200 with wrong MIME, missing HTML or oversized body cannot warm the route', async () => {
  for (const patch of [
    { headers: () => ({ 'content-type': 'application/json' }) },
    {
      body: async () => {
        throw new Error(sentinel);
      },
    },
    { body: async () => Buffer.alloc(0) },
    { body: async () => Buffer.from(sentinel) },
    { body: async () => Buffer.alloc(8 * 1024 * 1024 + 1) },
  ]) {
    const f = fixture(patch);
    await assert.rejects(
      prewarmProfileRoute(f.request, origin, workspace, f.options)
    );
    assert.deepEqual(f.calls.slice(1), ['dispose']);
    assert.throws(() => assertProfilePrewarmedResult(result(f.lines)));
    assert.doesNotMatch(f.lines.join(''), new RegExp(sentinel, 'u'));
  }
});

test('external or malformed destinations are rejected before a request', async () => {
  for (const badOrigin of [
    'https://external.invalid',
    'http://localhost:7803',
    'http://127.0.0.1:7833/path',
    `http://${sentinel}@localhost:7833`,
    `http://localhost:7833/?${sentinel}`,
    'http://[::1]:7833',
  ]) {
    const f = fixture();
    await assert.rejects(
      prewarmProfileRoute(f.request, badOrigin, workspace, f.options),
      /\(destination\)/u
    );
    assert.deepEqual(f.calls, []);
    assert.doesNotMatch(f.lines.join(''), new RegExp(sentinel, 'u'));
  }
  const f = fixture();
  await assert.rejects(
    prewarmProfileRoute(f.request, origin, '../foreign', f.options)
  );
  assert.deepEqual(f.calls, []);
});

test('request, timeout and disposal failures stay failed with value-free evidence', async () => {
  for (const name of ['Error', 'TimeoutError']) {
    const f = fixture();
    f.request.get = async () => {
      const error = new Error(sentinel);
      error.name = name;
      throw error;
    };
    await assert.rejects(
      prewarmProfileRoute(f.request, origin, workspace, f.options),
      (error) => !error.message.includes(sentinel)
    );
    assert.equal(f.lines.length, 1);
    assert.doesNotMatch(f.lines.join(''), new RegExp(sentinel, 'u'));
    assert.throws(() => assertProfilePrewarmedResult(result(f.lines)));
  }
  const f = fixture({
    dispose: async () => {
      throw new Error(sentinel);
    },
  });
  await assert.rejects(
    prewarmProfileRoute(f.request, origin, workspace, f.options),
    /\(disposal\)/u
  );
  assert.equal(
    profilePrewarmDiagnostics(result(f.lines)).record.responseDisposed,
    false
  );
  assert.doesNotMatch(f.lines.join(''), new RegExp(sentinel, 'u'));
});

test('elapsed setup cannot exceed 60 seconds or manufacture a duration', async () => {
  for (const end of [60011, NaN, -1]) {
    const f = fixture();
    let calls = 0;
    f.options.now = () => (calls++ === 0 ? 10 : end);
    await assert.rejects(
      prewarmProfileRoute(f.request, origin, workspace, f.options)
    );
    assert.throws(() => assertProfilePrewarmedResult(result(f.lines)));
  }
});

test('malformed, missing, partial, duplicate, retried or private receipt fields stay unknown', async () => {
  const f = fixture();
  await prewarmProfileRoute(f.request, origin, workspace, f.options);
  const good = profilePrewarmDiagnostics(result(f.lines)).record;
  const duplicate = JSON.stringify(good).replace(
    '"version":1',
    '"version":0,"version":1'
  );
  const line = (value) => `${PROFILE_PREWARM_MARKER}${JSON.stringify(value)}\n`;
  for (const bad of [
    null,
    {},
    { retry: 1, stdout: result(f.lines).stdout },
    result([f.lines[0].trimEnd()]),
    result([f.lines[0], f.lines[0]]),
    result([line({ ...good, private: sentinel })]),
    result([line({ ...good, reason: sentinel })]),
    result([line({ ...good, responseComplete: false })]),
    result([line({ ...good, responseDisposed: false })]),
    result([line({ ...good, elapsedMs: 60001 })]),
    result([line({ ...good, bodyBytes: 0 })]),
    result([line({ ...good, outcome: 'failed' })]),
    result([`${PROFILE_PREWARM_MARKER}${duplicate}\n`]),
    result(['x'.repeat(131073)]),
    { retry: 0, stdout: [{ text: f.lines[0], private: sentinel }] },
    { retry: 0, stdout: Array.from({ length: 257 }, () => ({ text: '' })) },
  ]) {
    const safe = profilePrewarmDiagnostics(bad);
    assert.equal(safe.state, 'unknown');
    assert.throws(() => assertProfilePrewarmedResult(bad));
    assert.doesNotMatch(JSON.stringify(safe), new RegExp(sentinel, 'u'));
  }
});

test('the terminal summary retains only the profile preparation receipt', async () => {
  const f = fixture();
  await prewarmProfileRoute(f.request, origin, workspace, f.options);
  const titles = ['owned profile', 'owned transport'];
  const report = {
    suites: [
      {
        specs: titles.map((title) => ({
          title,
          tests: [
            {
              results: [
                { status: 'passed', ...result([...f.lines, sentinel + '\n']) },
              ],
            },
          ],
        })),
      },
    ],
  };
  const summary = summarizeBrowserResults(report, titles);
  assert.equal(summary[0].profilePreparation.record.outcome, 'passed');
  assert.equal(summary[1].profilePreparation, undefined);
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(sentinel, 'u'));
});
