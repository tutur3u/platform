const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  createSmokePlan,
  formatResult,
  isSuccessfulStatus,
  parseArgs,
  runSmoke,
  writeSmokeReport,
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

test('parseArgs allows plaintext only for local Wrangler dev origins', () => {
  const args = parseArgs([], {
    BACKEND_INTERNAL_TOKEN: 'token',
    BACKEND_WORKER_ORIGIN: 'http://localhost:8780',
    TANSTACK_WEB_WORKER_ORIGIN: 'http://127.0.0.1:8784/path',
  });

  assert.equal(args.backendOrigin, 'http://localhost:8780');
  assert.equal(args.tanstackOrigin, 'http://127.0.0.1:8784');
  assert.throws(
    () =>
      parseArgs([], {
        BACKEND_INTERNAL_TOKEN: 'token',
        BACKEND_WORKER_ORIGIN: 'http://backend.example.workers.dev',
        TANSTACK_WEB_WORKER_ORIGIN: 'https://tanstack.example.workers.dev',
      }),
    /must use HTTPS unless it targets localhost Wrangler dev/u
  );
});

test('parseArgs rejects non-HTTP and credentialed Worker origins', () => {
  assert.throws(
    () =>
      parseArgs([], {
        BACKEND_INTERNAL_TOKEN: 'token',
        BACKEND_WORKER_ORIGIN: 'ftp://backend.example.workers.dev',
        TANSTACK_WEB_WORKER_ORIGIN: 'https://tanstack.example.workers.dev',
      }),
    /must be an HTTP\(S\) origin/u
  );
  assert.throws(
    () =>
      parseArgs([], {
        BACKEND_INTERNAL_TOKEN: 'token',
        BACKEND_WORKER_ORIGIN: 'https://user:pass@backend.example.workers.dev',
        TANSTACK_WEB_WORKER_ORIGIN: 'https://tanstack.example.workers.dev',
      }),
    /must not include credentials/u
  );
});

test('parseArgs accepts Cloudflare smoke report output paths', () => {
  const args = parseArgs(
    ['--output', 'tmp/benchmarks/web-migration/smoke/report.json'],
    {
      BACKEND_INTERNAL_TOKEN: 'token',
      BACKEND_WORKER_ORIGIN: 'https://backend.example.workers.dev',
      TANSTACK_WEB_WORKER_ORIGIN: 'https://tanstack.example.workers.dev',
    }
  );

  assert.equal(
    args.outputPath,
    'tmp/benchmarks/web-migration/smoke/report.json'
  );
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

test('createSmokePlan sends the real authorization only to the protected success probe', () => {
  const plan = createSmokePlan({
    backendOrigin: 'https://backend.example.workers.dev',
    tanstackOrigin: 'https://tanstack.example.workers.dev',
    token: 'secret-token',
  });

  const migrationProbe = plan.find(
    (probe) => probe.id === 'backend-migration-status'
  );
  const invalidTokenProbe = plan.find(
    (probe) => probe.id === 'backend-migration-status-invalid-token'
  );
  const publicProbe = plan.find((probe) => probe.id === 'backend-health');

  assert.equal(migrationProbe.headers.authorization, 'Bearer secret-token');
  assert.equal(
    invalidTokenProbe.headers.authorization,
    'Bearer invalid-cloudflare-smoke-token'
  );
  assert.equal(
    plan.filter(
      (probe) =>
        new Headers(probe.headers).get('authorization') ===
        'Bearer secret-token'
    ).length,
    1
  );
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
  assert.equal(report.results[3].ok, true);
  assert.equal(report.results[3].expectedStatus, 401);
  assert.equal(report.results[4].ok, true);
  assert.equal(report.results[4].expectedStatus, 401);
});

test('runSmoke validates migration JSON shape and TanStack backend-connected shell body', async () => {
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/api/migration/status')) {
      const authorization = new Headers(init.headers).get('authorization');

      if (authorization !== 'Bearer secret-token') {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }

      return Response.json({
        backend: {
          deploymentTarget: 'cloudflare-workers',
          runtime: 'rust',
        },
      });
    }

    return new Response('TanStack Start + Rust readiness Backend reachable', {
      status: 200,
    });
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
  assert.deepEqual(report.provenance, {
    backendOrigin: 'https://backend.example.workers.dev',
    probeIds: [
      'backend-health',
      'backend-ready',
      'backend-migration-status',
      'backend-migration-status-missing-token',
      'backend-migration-status-invalid-token',
      'tanstack-root',
    ],
    reporter: 'scripts/smoke-cloudflare-workers.js',
    tanstackOrigin: 'https://tanstack.example.workers.dev',
    timeoutMs: 1000,
  });
  assert.doesNotMatch(JSON.stringify(report.provenance), /secret-token/u);
});

test('runSmoke requires the Rust backend to report a Cloudflare Workers target', async () => {
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/api/migration/status')) {
      const authorization = new Headers(init.headers).get('authorization');

      if (authorization !== 'Bearer secret-token') {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }

      return Response.json({
        backend: {
          deploymentTarget: 'container',
          runtime: 'rust',
        },
      });
    }

    return new Response('TanStack Start + Rust readiness Backend reachable', {
      status: 200,
    });
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
    report.results[2].detail,
    'JSON response did not match the expected migration status shape'
  );
});

test('runSmoke fails when the TanStack shell cannot reach the Rust backend', async () => {
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/api/migration/status')) {
      const authorization = new Headers(init.headers).get('authorization');

      if (authorization !== 'Bearer secret-token') {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }

      return Response.json({
        backend: {
          deploymentTarget: 'cloudflare-workers',
          runtime: 'rust',
        },
      });
    }

    return new Response('TanStack Start + Rust readiness Backend offline', {
      status: 200,
    });
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
    report.results[5].detail,
    'response body did not include "Backend reachable"'
  );
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

test('writeSmokeReport keeps reports under ignored benchmark output', () => {
  const report = {
    generatedAt: '2026-06-20T00:00:00.000Z',
    ok: true,
    provenance: {
      backendOrigin: 'https://backend.example.workers.dev',
      probeIds: [],
      reporter: 'scripts/smoke-cloudflare-workers.js',
      tanstackOrigin: 'https://tanstack.example.workers.dev',
      timeoutMs: 1000,
    },
    results: [],
  };
  const writes = [];
  const fsImpl = {
    mkdirSync: (dirPath) => writes.push(['mkdir', dirPath]),
    writeFileSync: (filePath, content) =>
      writes.push(['write', filePath, content]),
  };

  const reportPath = writeSmokeReport(
    report,
    'tmp/benchmarks/web-migration/cloudflare/smoke.json',
    fsImpl
  );

  assert.match(
    reportPath,
    /tmp\/benchmarks\/web-migration\/cloudflare\/smoke\.json$/u
  );
  assert.equal(writes.length, 2);
  assert.equal(
    JSON.parse(writes[1][2]).generatedAt,
    '2026-06-20T00:00:00.000Z'
  );
  assert.throws(
    () =>
      writeSmokeReport(
        report,
        path.join('/tmp', 'outside-cloudflare-smoke.json'),
        fsImpl
      ),
    /Cloudflare smoke reports must be written under tmp\/benchmarks\/web-migration/u
  );
});
