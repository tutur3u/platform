const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSmokePlan,
  formatResult,
  isSuccessfulStatus,
  parseArgs,
  runSmoke,
} = require('./smoke-cloudflare-workers.js');

test('parseArgs reads Cloudflare smoke inputs from env', () => {
  const args = parseArgs([], {
    BACKEND_INTERNAL_TOKEN: 'token',
    BACKEND_WORKER_ORIGIN: 'backend.example.workers.dev',
    TANSTACK_WEB_WORKER_ORIGIN: 'https://tanstack.example.workers.dev/path',
  });

  assert.equal(args.backendOrigin, 'https://backend.example.workers.dev');
  assert.equal(args.tanstackOrigin, 'https://tanstack.example.workers.dev');
  assert.equal(args.token, 'token');
});

test('parseArgs requires worker origins and token', () => {
  assert.throws(() => parseArgs([], {}), /BACKEND_WORKER_ORIGIN is required/u);
  assert.throws(
    () =>
      parseArgs([], {
        BACKEND_WORKER_ORIGIN: 'https://backend.example.workers.dev',
        TANSTACK_WEB_WORKER_ORIGIN: 'https://tanstack.example.workers.dev',
      }),
    /BACKEND_INTERNAL_TOKEN is required/u
  );
});

test('createSmokePlan sends authorization only to the protected backend probe', () => {
  const plan = createSmokePlan({
    backendOrigin: 'https://backend.example.workers.dev',
    tanstackOrigin: 'https://tanstack.example.workers.dev',
    token: 'secret-token',
  });

  const migrationProbe = plan.find(
    (probe) => probe.id === 'backend-migration-status'
  );
  const publicProbe = plan.find((probe) => probe.id === 'backend-health');

  assert.equal(migrationProbe.headers.authorization, 'Bearer secret-token');
  assert.equal(publicProbe.headers, undefined);
});

test('runSmoke fails unauthorized protected migration status responses', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ init, url });

    if (url.endsWith('/api/migration/status')) {
      return new Response('unauthorized', { status: 401 });
    }

    return new Response('TanStack Start + Rust readiness', { status: 200 });
  };

  const report = await runSmoke(
    {
      backendOrigin: 'https://backend.example.workers.dev',
      tanstackOrigin: 'https://tanstack.example.workers.dev',
      timeoutMs: 1000,
      token: 'secret-token',
    },
    fetchImpl
  );

  assert.equal(report.ok, false);
  assert.equal(
    new Headers(calls[2].init.headers).get('authorization'),
    'Bearer secret-token'
  );
  assert.equal(report.results[2].status, 401);
});

test('runSmoke validates migration JSON shape and TanStack shell body', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/api/migration/status')) {
      return Response.json({
        backend: {
          deploymentTarget: 'cloudflare-workers',
          runtime: 'rust',
        },
      });
    }

    return new Response('TanStack Start + Rust readiness', { status: 200 });
  };

  const report = await runSmoke(
    {
      backendOrigin: 'https://backend.example.workers.dev',
      tanstackOrigin: 'https://tanstack.example.workers.dev',
      timeoutMs: 1000,
      token: 'secret-token',
    },
    fetchImpl
  );

  assert.equal(report.ok, true);
});

test('status helper and formatted output do not expose bearer tokens', () => {
  assert.equal(isSuccessfulStatus(399), true);
  assert.equal(isSuccessfulStatus(400), false);
  assert.doesNotMatch(
    formatResult({
      detail: 'unauthorized',
      durationMs: 10,
      label: 'Rust migration status',
      ok: false,
      status: 401,
    }),
    /Bearer|secret-token/u
  );
});
