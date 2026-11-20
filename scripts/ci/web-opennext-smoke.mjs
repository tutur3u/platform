import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local emitted-Worker smoke for an apps/web OpenNext family build. Serves the
// built Worker in workerd with the production Host header, no provider auth
// and every outbound request refused, then checks the build identity and the
// family's own probe paths. Secrets a family requires get synthetic values;
// a family that requires none runs with no secret bindings at all.

const APP_DIR = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const HOST = 'tuturuuu.com';
export const HARD_TIMEOUT_MS = 180_000;

/** Paths each family must answer, with the expected status. */
export const FAMILY_PROBES = {
  'public-docs': [
    { path: '/changelog', status: 200 },
    { path: '/visualizations/horse-racing', status: 200 },
    { path: '/docs', status: 307 },
    { path: '/ui', status: 301 },
  ],
  'api-identity': [{ path: '/api/v1/users/me/profile', status: 401 }],
};

export function deploymentId(family, sha) {
  return `web-${family}-${sha.slice(0, 12)}`;
}

/** Problems with the responses; empty means the smoke passed. */
export function judge({ family, sha, buildInfo, probes, emitted }) {
  const problems = [];
  if (buildInfo.status !== 200) {
    problems.push(`GET /api/build-info answered ${buildInfo.status}`);
  } else {
    let commit = null;
    try {
      commit = JSON.parse(buildInfo.body)?.commitHash ?? null;
    } catch {
      problems.push('GET /api/build-info body is not JSON');
    }
    if (commit !== sha) {
      problems.push(`commitHash ${commit} differs from ${sha}`);
    }
  }
  const expectedId = deploymentId(family, sha);
  // Next answers only navigation requests with x-nextjs-deployment-id; every
  // emitted server config must carry the id and any response that sends the
  // header must match it.
  if (emitted.length === 0)
    problems.push('no emitted required-server-files.json');
  for (const { file, deploymentId: value } of emitted) {
    if (value !== expectedId) {
      problems.push(`${file} deploymentId ${value} differs from ${expectedId}`);
    }
  }
  const seen = [buildInfo, ...probes.map((probe) => probe.response)]
    .map((response) => response.deploymentId)
    .filter(Boolean);
  for (const value of seen) {
    if (value !== expectedId) {
      problems.push(
        `x-nextjs-deployment-id ${value} differs from ${expectedId}`
      );
    }
  }
  for (const { path, status, response } of probes) {
    if (response.status !== status) {
      problems.push(
        `GET ${path} answered ${response.status}, expected ${status}`
      );
    }
  }
  return problems;
}

function call(origin, path) {
  return new Promise((resolvePromise, reject) => {
    const target = new URL(origin);
    // node:http keeps the explicit Host header; fetch() would overwrite it.
    httpRequest(
      {
        host: target.hostname,
        port: target.port,
        path,
        method: 'GET',
        headers: {
          host: HOST,
          accept: path.startsWith('/api/')
            ? 'application/json'
            : 'text/html,application/xhtml+xml',
          'user-agent': 'tuturuuu-web-opennext-smoke',
          'x-forwarded-host': HOST,
          'x-forwarded-proto': 'https',
          // The gateway passes the client IP through; TRUSTED_PROXY=cloudflare
          // requires it. TEST-NET-3 address.
          'cf-connecting-ip': '203.0.113.10',
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolvePromise({
            status: response.statusCode ?? 0,
            deploymentId: response.headers['x-nextjs-deployment-id'] ?? null,
            location: response.headers.location ?? null,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
      }
    )
      .on('error', reject)
      .end();
  });
}

/** deploymentId of every emitted Next server config in the OpenNext output. */
export function emittedDeploymentIds(
  openNextDir = join(APP_DIR, '.open-next')
) {
  return [
    'server-functions/default/apps/web/.next/required-server-files.json',
    'middleware/apps/web/.next/required-server-files.json',
  ]
    .filter((file) => existsSync(join(openNextDir, file)))
    .map((file) => ({
      file,
      deploymentId:
        JSON.parse(readFileSync(join(openNextDir, file), 'utf8')).config
          ?.deploymentId ?? null,
    }));
}

function stripJsonComments(text) {
  return text
    .replace(
      /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//gu,
      (match, string) => string ?? ''
    )
    .replace(/,(\s*[}\]])/gu, '$1');
}

export async function runSmoke(
  family,
  sha,
  { appDir = APP_DIR, log = console.log } = {}
) {
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error('Expected a 40-hex commit');
  if (!FAMILY_PROBES[family]) throw new Error(`No probes for family ${family}`);
  process.env.WRANGLER_SEND_METRICS ??= 'false';
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  const configPath = join(
    appDir,
    `cloudflare/opennext/wrangler.${family}.jsonc`
  );
  const config = JSON.parse(
    stripJsonComments(readFileSync(configPath, 'utf8'))
  );
  if (family === 'api-identity') {
    assert.deepEqual(
      config.services.filter(({ binding }) => binding === 'ABUSE_GUARD'),
      [
        {
          binding: 'ABUSE_GUARD',
          service: 'tuturuuu-abuse-guard',
          entrypoint: 'AbuseGuardEntrypoint',
        },
      ]
    );
    assert.equal(config.vars.ABUSE_GUARD_FAMILIES, 'proxy,ratelimit,integrity');
    assert.equal(config.vars.NATIVE_INTEGRITY_STORE, 'abuse-guard');
    assert.ok(config.secrets.required.includes('ABUSE_GUARD_KEY_PEPPER'));
    assert.ok(!config.secrets.required.includes('UPSTASH_REDIS_REST_TOKEN'));
    assert.ok(!Object.hasOwn(config.vars, 'UPSTASH_REDIS_REST_URL'));
  }
  // Public configuration the deploy passes as plain-text vars.
  const bindings = {
    NEXT_PUBLIC_SUPABASE_URL: {
      type: 'plain_text',
      value: 'https://smoke.supabase.invalid',
    },
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
      type: 'plain_text',
      value: 'sb_publishable_smoke',
    },
    SUPABASE_URL: {
      type: 'plain_text',
      value: 'https://smoke.supabase.invalid',
    },
    ROOT_WORKSPACE_ID: {
      type: 'plain_text',
      value: '00000000-0000-0000-0000-000000000000',
    },
  };
  for (const name of config.secrets?.required ?? []) {
    bindings[name] = {
      type: 'secret_text',
      value: 'web-opennext-smoke-synthetic-only',
    };
  }
  for (const service of config.services ?? []) {
    bindings[service.binding] = {
      type: 'fetcher',
      fetcher: async () =>
        new Response('smoke: no service bindings', { status: 503 }),
    };
  }
  const require = createRequire(join(APP_DIR, 'package.json'));
  const { unstable_startWorker: startWorker } = require('wrangler');
  const scratch = await mkdtemp(
    join(tmpdir(), `web-opennext-smoke-${family}-`)
  );
  const envFile = join(scratch, 'empty.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const egress = [];
  let worker;
  const timer = setTimeout(() => {
    console.error(
      `smoke FAILED: ${family} did not answer within ${HARD_TIMEOUT_MS / 1000}s`
    );
    process.exit(1);
  }, HARD_TIMEOUT_MS);
  try {
    worker = await startWorker({
      config: configPath,
      envFiles: [envFile],
      sendMetrics: false,
      bindings,
      dev: {
        remote: false,
        watch: false,
        persist: false,
        inspector: false,
        liveReload: false,
        logLevel: 'error',
        generateTypes: false,
        enableContainers: false,
        registry: join(scratch, 'registry'),
        server: { hostname: '127.0.0.1', port: 0 },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider auth is forbidden in the smoke');
        },
        outboundService: (request) => {
          egress.push(new URL(request.url).origin);
          return new Response('{"error":"denied by the smoke"}', {
            status: 599,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    });
    await worker.ready;
    const origin = (await worker.url).origin;
    const buildInfo = await call(origin, '/api/build-info');
    const probes = [];
    for (const probe of FAMILY_PROBES[family]) {
      probes.push({ ...probe, response: await call(origin, probe.path) });
    }
    const describe = (path, response) =>
      `GET ${path} -> ${response.status}${response.location ? ` (${response.location})` : ''} deployment=${response.deploymentId}${response.status >= 400 ? ` body=${response.body.slice(0, 300)}` : ''}`;
    log(describe('/api/build-info', buildInfo));
    for (const probe of probes) log(describe(probe.path, probe.response));
    if (egress.length)
      log(`refused outbound: ${[...new Set(egress)].join(', ')}`);
    const emitted = emittedDeploymentIds(join(appDir, '.open-next'));
    for (const { file, deploymentId: value } of emitted)
      log(`${file}: deploymentId ${value}`);
    const problems = judge({ family, sha, buildInfo, probes, emitted });
    if (problems.length) {
      throw new Error(
        `smoke FAILED for ${family}:\n${problems.map((p) => `  - ${p}`).join('\n')}`
      );
    }
    log(`smoke passed for ${family} at ${sha}`);
  } finally {
    clearTimeout(timer);
    if (worker) await worker.dispose().catch(() => undefined);
    await rm(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [family, sha, appDir] = process.argv.slice(2);
  try {
    await runSmoke(family, sha, { appDir });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
