const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulePromise = import('./actions-storage-report.ts');

test('classifies configured cache thresholds', async () => {
  const { classifyUsage } = await modulePromise;
  const thresholds = { notice: 80, warning: 90, critical: 100 };

  assert.equal(classifyUsage(79.9, thresholds), 'normal');
  assert.equal(classifyUsage(80, thresholds), 'notice');
  assert.equal(classifyUsage(90, thresholds), 'warning');
  assert.equal(classifyUsage(100, thresholds), 'critical');
});

test('groups storage-heavy workflow families deterministically', async () => {
  const { groupStorage } = await modulePromise;
  const groups = groupStorage([
    { name: 'e2e-failure-1-of-4', size: 100 },
    { name: 'e2e-failure-2-of-4', size: 200 },
    { name: 'supabase-docker-v2-Linux-X64', size: 250 },
    { name: 'ubuntu-latest-turbo-e2e-sha', size: 50 },
  ]);

  assert.deepEqual(groups, [
    { family: 'e2e-failure', count: 2, bytes: 300 },
    { family: 'supabase-docker', count: 1, bytes: 250 },
    { family: 'turbo', count: 1, bytes: 50 },
  ]);
});

test('formats binary storage units', async () => {
  const { formatBytes } = await modulePromise;

  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.00 KiB');
  assert.equal(formatBytes(10 * 1024 ** 3), '10.00 GiB');
});

test('paginates every cache and artifact page beyond 100 entries', async () => {
  const { paginateGitHubCollection } = await modulePromise;

  for (const property of ['actions_caches', 'artifacts']) {
    const calls = [];
    const values = await paginateGitHubCollection({
      path: `/actions/${property}`,
      property,
      async request(requestPath, query) {
        calls.push({ path: requestPath, query });
        const pageValues =
          query.page === 1
            ? Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }))
            : [{ id: 101 }];
        return { [property]: pageValues };
      },
    });

    assert.equal(values.length, 101);
    assert.deepEqual(calls, [
      { path: `/actions/${property}`, query: { page: 1, per_page: 100 } },
      { path: `/actions/${property}`, query: { page: 2, per_page: 100 } },
    ]);
  }
});

test('weekly storage workflow is read-only and needs no billing token', () => {
  const workflowPath = path.join(
    __dirname,
    '..',
    '..',
    '.github',
    'workflows',
    'actions-storage-report.yaml'
  );
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: "17 6 \* \* 1"/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /\b(?:actions|contents): write\b/);
  assert.match(workflow, /GITHUB_API_VERSION: "2026-03-10"/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(
    workflow,
    /BILLING_TOKEN|ORG_TOKEN|PERSONAL_ACCESS_TOKEN|GH_PAT/
  );
});

async function syntheticApi(transport, overrides = {}) {
  const { createApiClient } = await modulePromise;
  let clock = 0;
  const sleeps = [];
  const api = createApiClient({
    apiBase: 'https://synthetic.invalid',
    apiVersion: 'test',
    token: 'synthetic-only',
    transport,
    now: () => clock,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      clock += milliseconds;
    },
    ...overrides,
  });
  return {
    api,
    sleeps,
    advance: (milliseconds) => {
      clock += milliseconds;
    },
  };
}

test('transient server statuses retry the same page after canceling its body', async () => {
  for (const status of [500, 502, 503, 504]) {
    const calls = [];
    let canceled = false;
    const { api, sleeps } = await syntheticApi(async (url, options) => {
      calls.push(new URL(url).searchParams.get('page'));
      assert.equal(options.method, 'GET');
      if (calls.length === 1) {
        return new Response(
          new ReadableStream({
            cancel() {
              canceled = true;
            },
          }),
          { status }
        );
      }
      assert.equal(canceled, true);
      return Response.json({
        artifacts:
          calls.length === 2
            ? Array.from({ length: 100 }, (_, id) => ({ id }))
            : [{ id: 100 }],
      });
    });
    const rows = await api.paginate('/private/artifacts', 'artifacts');
    assert.deepEqual(calls, ['1', '1', '2']);
    assert.deepEqual(sleeps, [250]);
    assert.equal(rows.length, 101);
    assert.equal(new Set(rows.map((row) => row.id)).size, 101);
  }
});

test('persistent 500 exhausts three attempts and keeps required reports failed', async () => {
  let calls = 0;
  const { api, sleeps } = await syntheticApi(async () => {
    calls++;
    return new Response('synthetic', { status: 500 });
  });
  await assert.rejects(
    api.request('/private?token=secret'),
    /^Error: GitHub API GET failed with 500\.$/
  );
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [250, 500]);
});

test('403 and other nonretryable responses fail once; optional 403 remains a notice', async () => {
  const { optionalValue } = await modulePromise;
  for (const status of [403, 429, 501]) {
    let calls = 0;
    const { api, sleeps } = await syntheticApi(async () => {
      calls++;
      return new Response('synthetic', { status });
    });
    await assert.rejects(
      api.request('/required'),
      new RegExp(`failed with ${status}`)
    );
    assert.equal(calls, 1);
    assert.deepEqual(sleeps, []);
  }
  const { api } = await syntheticApi(
    async () => new Response('', { status: 403 })
  );
  const notices = [];
  const original = console.log;
  console.log = (message) => notices.push(message);
  try {
    assert.equal(
      await optionalValue(api.request('/private'), 'Retention'),
      null
    );
  } finally {
    console.log = original;
  }
  assert.deepEqual(notices, [
    '::notice title=Retention unavailable::GitHub API GET failed with 403.',
  ]);
});

test('whole request deadline prevents another retry and late success', async () => {
  let calls = 0;
  let control;
  control = await syntheticApi(async () => {
    calls++;
    control.advance(29_900);
    return new Response('', { status: 503 });
  });
  await assert.rejects(control.api.request('/private'), /deadline exceeded/);
  assert.equal(calls, 1);
  assert.deepEqual(control.sleeps, []);
  control = await syntheticApi(async () => {
    control.advance(30_000);
    return Response.json({ incomplete: false });
  });
  await assert.rejects(control.api.request('/private'), /deadline exceeded/);
});

test('attempt abort reaches pending transport and body reads without a retry', async () => {
  for (const stage of ['transport', 'body']) {
    let abort;
    let cleaned = 0;
    let calls = 0;
    let signal;
    const { api } = await syntheticApi(
      async (_url, options) => {
        calls++;
        signal = options.signal;
        if (stage === 'transport') {
          return new Promise((_resolve, reject) =>
            signal.addEventListener(
              'abort',
              () => reject(new Error('secret-url')),
              { once: true }
            )
          );
        }
        return new Response(
          new ReadableStream({
            start(controller) {
              signal.addEventListener(
                'abort',
                () => controller.error(new Error('secret-body')),
                { once: true }
              );
            },
          })
        );
      },
      {
        scheduleAbort(callback, milliseconds) {
          assert.equal(milliseconds, 10_000);
          abort = callback;
          return () => {
            cleaned++;
          };
        },
      }
    );
    const pending = api.request('/private?credential=secret');
    await Promise.resolve();
    abort();
    await assert.rejects(
      pending,
      /^Error: GitHub API GET deadline exceeded\.$/
    );
    assert.equal(signal.aborted, true);
    assert.equal(calls, 1);
    assert.equal(cleaned, 1);
  }
});

test('transport and malformed response failures are sanitized and not retried', async () => {
  for (const transport of [
    async () => {
      throw new Error('private-token-url');
    },
    async () => new Response('not-json'),
  ]) {
    const { api, sleeps } = await syntheticApi(transport);
    await assert.rejects(
      api.request('/secret'),
      /^Error: GitHub API GET transport or response failed\.$/
    );
    assert.deepEqual(sleeps, []);
  }
});

test('pagination exhaustion still rejects incomplete reports', async () => {
  const { paginateGitHubCollection } = await modulePromise;
  await assert.rejects(
    paginateGitHubCollection({
      maxPages: 2,
      path: '/artifacts',
      property: 'artifacts',
      request: async () => ({
        artifacts: Array.from({ length: 100 }, (_, id) => ({ id })),
      }),
    }),
    /pagination exceeded 2 pages/
  );
});

test('delayed failed-body cancellation must finish before backoff or retry', async () => {
  let finishCancel;
  let calls = 0;
  let signal;
  const { api, sleeps } = await syntheticApi(async (_url, options) => {
    calls++;
    if (calls > 1) return Response.json({ recovered: true });
    signal = options.signal;
    return new Response(
      new ReadableStream({
        cancel() {
          return new Promise((resolve) => {
            finishCancel = resolve;
          });
        },
      }),
      { status: 500 }
    );
  });
  const pending = api.request('/required');
  await new Promise(setImmediate);
  assert.equal(typeof finishCancel, 'function');
  assert.equal(signal.aborted, false);
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
  finishCancel();
  assert.deepEqual(await pending, { recovered: true });
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [250]);
});

test('Abort fails stalled cancel before settlement and observes late fulfillment or rejection', async () => {
  for (const late of ['fulfill', 'reject']) {
    let abort;
    let finishCancel;
    let rejectCancel;
    let signal;
    let cleaned = 0;
    let calls = 0;
    let outcome = 'pending';
    const { api, sleeps } = await syntheticApi(
      async (_url, options) => {
        calls++;
        signal = options.signal;
        return new Response(
          new ReadableStream({
            cancel() {
              return new Promise((resolve, reject) => {
                finishCancel = resolve;
                rejectCancel = reject;
              });
            },
          }),
          { status: 500 }
        );
      },
      {
        scheduleAbort(callback, milliseconds) {
          assert.equal(milliseconds, 10_000);
          abort = callback;
          return () => {
            cleaned++;
          };
        },
      }
    );
    const observed = api.request('/private?credential=secret').then(
      () => {
        outcome = 'unexpected success';
      },
      (error) => {
        outcome = error.message;
      }
    );
    await new Promise(setImmediate);
    assert.equal(typeof finishCancel, 'function');
    abort();
    try {
      await new Promise(setImmediate);
      assert.equal(outcome, 'GitHub API GET deadline exceeded.');
      assert.equal(signal.aborted, true);
      assert.equal(cleaned, 1);
      assert.equal(calls, 1);
      assert.deepEqual(sleeps, []);
    } finally {
      if (late === 'fulfill') finishCancel();
      else rejectCancel(new Error('private-late-cancel-token'));
      await observed;
      await new Promise(setImmediate);
    }
    assert.equal(outcome, 'GitHub API GET deadline exceeded.');
    assert.equal(calls, 1);
    assert.deepEqual(sleeps, []);
  }
});

test('Abort before cancel starts and cancel rejection both deny retry', async () => {
  for (const stage of ['already-aborted', 'cancel-rejected', 'cancel-aborts']) {
    let abort;
    let calls = 0;
    let cancellations = 0;
    let cleaned = 0;
    const { api, sleeps } = await syntheticApi(
      async () => {
        calls++;
        if (stage === 'already-aborted') abort();
        return new Response(
          new ReadableStream({
            cancel() {
              cancellations++;
              if (stage === 'cancel-aborts') abort();
              if (stage === 'cancel-rejected') {
                return Promise.reject(new Error('private-cancel-token'));
              }
            },
          }),
          { status: 503 }
        );
      },
      {
        scheduleAbort(callback) {
          abort = callback;
          return () => {
            cleaned++;
          };
        },
      }
    );
    await assert.rejects(
      api.request('/private?token=secret'),
      stage === 'cancel-rejected'
        ? /^Error: GitHub API GET transport or response failed\.$/
        : /^Error: GitHub API GET deadline exceeded\.$/
    );
    assert.equal(cancellations, 1);
    assert.equal(calls, 1);
    assert.equal(cleaned, 1);
    assert.deepEqual(sleeps, []);
  }
});
