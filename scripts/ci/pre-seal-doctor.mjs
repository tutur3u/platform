import assert from 'node:assert/strict';
import {
  cp,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pre-seal doctor: serve the artifact that is about to be sealed with the
// PRODUCTION Host header and refuse the seal when the app does not answer.
// It catches a production host that no mount serves (404), a proxy that rejects
// the anonymous build identity (401) and a production profile that is missing a
// gateway variable (503) before bytes are sealed, not after a DNS flip.

const USAGE =
  'Usage: pre-seal-doctor.mjs <app> <artifact-dir> <production-host> <expected-commit-sha> [--expect-redirect] [--config <path-inside-artifact-dir>]';
export const DEFAULT_CONFIG = 'dist/server/wrangler.json';
export const HARD_TIMEOUT_MS = 120_000;
// A redirect only counts when it hands an anonymous visitor to an auth page.
const AUTH_PATH =
  /\/(?:login|verify-token|sign-?in|auth|callback)(?:[/?#]|$)/iu;
const WEB_LOGIN_HOSTS = ['tuturuuu.com', 'www.tuturuuu.com'];
const REDIRECT_HOSTS = (host) =>
  new Set([host.toLowerCase(), ...WEB_LOGIN_HOSTS]);
// Names only; the values are synthetic and never reach a supplier.
const SYNTHETIC_NAMES = [
  'ABUSE_GUARD_FAMILIES',
  'ABUSE_GUARD_KEY_PEPPER',
  'INTERNAL_WEB_API_ORIGIN',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
  'UPSTASH_REDIS_REST_TOKEN',
  'UPSTASH_REDIS_REST_URL',
];

export function parseArgs(argv) {
  const positional = [];
  const options = { expectRedirect: false, config: DEFAULT_CONFIG };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--expect-redirect') options.expectRedirect = true;
    else if (arg === '--config') {
      const value = argv[(index += 1)];
      if (!value || value.startsWith('--'))
        throw new Error(`--config needs a path\n${USAGE}`);
      options.config = value;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}\n${USAGE}`);
    } else positional.push(arg);
  }
  if (positional.length !== 4)
    throw new Error(`Expected 4 positional arguments\n${USAGE}`);
  const [app, artifactDir, host, sha] = positional;
  if (!/^[a-z][a-z0-9-]*$/u.test(app))
    throw new Error(`Invalid app name "${app}"\n${USAGE}`);
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(host) || !host.includes('.'))
    throw new Error(`Production host must be a bare hostname, got "${host}"`);
  if (!/^[a-f0-9]{40}$/u.test(sha))
    throw new Error('Expected commit sha must be 40 lowercase hex characters');
  if (isAbsolute(options.config) || options.config.split('/').includes('..'))
    throw new Error('--config must stay inside the artifact directory');
  return { app, artifactDir, host, sha, ...options };
}

const describe = (response) =>
  `${response.status}${response.location ? ` -> ${response.location}` : ''}`;

/** Judge the response to `GET /`. Returns a list of problems (empty = pass). */
export function judgeRoot(response, { host, expectRedirect }) {
  const where = `GET / with Host ${host}`;
  const { status } = response;
  if (status === 200) return [];
  if (status >= 300 && status < 400) {
    if (!expectRedirect)
      return [
        `${where} answered ${describe(response)}; expected 200 (pass --expect-redirect when anonymous visitors are handed to login)`,
      ];
    const location = response.location ?? '';
    let path = location;
    let target = null;
    try {
      target = new URL(location, `https://${host}`);
      path = target.pathname;
    } catch {
      // A malformed Location is judged below as a non-auth target.
    }
    if (!target || !AUTH_PATH.test(path))
      return [
        `${where} redirected to "${location}", which is not an auth path`,
      ];
    // The auth page must live on the app's own host or on the web login host.
    return REDIRECT_HOSTS(host).has(target.hostname.toLowerCase())
      ? []
      : [
          `${where} redirected to "${location}", whose host is neither ${host} nor the web login host`,
        ];
  }
  const why =
    status === 404
      ? ' (the production host is not served by any mount)'
      : status === 503
        ? ' (a gateway or profile variable is missing)'
        : status === 401
          ? ' (the proxy rejects anonymous visitors)'
          : '';
  return [
    `${where} answered ${status}${why}; expected 200${expectRedirect ? ' or an auth redirect' : ''}`,
  ];
}

/** Judge the response to `GET /api/build-info`. */
export function judgeBuildInfo(response, { host, sha }) {
  const where = `GET /api/build-info with Host ${host}`;
  const { status } = response;
  if (status !== 200) {
    const why =
      status === 401
        ? ' (the proxy rejects the anonymous build identity)'
        : status === 404
          ? ' (the production host is not served by any mount)'
          : status === 503
            ? ' (a gateway or profile variable is missing)'
            : '';
    return [`${where} answered ${status}${why}; expected 200`];
  }
  let info;
  try {
    info = JSON.parse(response.body);
  } catch {
    return [`${where} answered 200 with a body that is not JSON`];
  }
  const commit = info?.commitHash;
  if (typeof commit !== 'string' || !commit)
    return [`${where} answered 200 without a commitHash field`];
  if (commit !== sha)
    return [`${where} reports commitHash ${commit}, expected ${sha}`];
  return [];
}

function call(origin, path, host) {
  return new Promise((resolvePromise, reject) => {
    const target = new URL(origin);
    // node:http keeps the explicit Host header; fetch() would overwrite it.
    httpRequest(
      {
        host: target.hostname,
        port: target.port,
        path,
        method: 'GET',
        headers: { host, accept: 'application/json,text/html;q=0.9' },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolvePromise({
            status: response.statusCode ?? 0,
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

function syntheticBindings(config) {
  const bound = new Set(Object.keys(config.vars ?? {}));
  const names = new Set([
    ...SYNTHETIC_NAMES,
    ...(config.secrets?.required ?? []),
  ]);
  const bindings = {};
  for (const name of names)
    if (!bound.has(name))
      bindings[name] = {
        type: 'secret_text',
        value:
          name === 'NEXT_PUBLIC_SUPABASE_URL'
            ? 'https://pre-seal-doctor.supabase.invalid'
            : name === 'INTERNAL_WEB_API_ORIGIN'
              ? 'https://central.invalid'
              : name === 'ABUSE_GUARD_FAMILIES'
                ? 'proxy'
                : 'pre-seal-doctor-synthetic-only',
      };
  // Service bindings point at Workers that do not exist locally.
  for (const service of config.services ?? [])
    if (service?.binding)
      bindings[service.binding] = {
        type: 'fetcher',
        fetcher: async () =>
          new Response('{"error":"guard_unavailable"}', {
            status: 503,
            headers: { 'content-type': 'application/json' },
          }),
      };
  return bindings;
}

export async function runDoctor(args, { log = console.log } = {}) {
  // Local-only run: no telemetry and no log files outside the temp directory.
  process.env.WRANGLER_SEND_METRICS ??= 'false';
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  const artifact = await realpath(resolve(args.artifactDir));
  const dist = join(artifact, 'dist');
  const sourceConfig = resolve(artifact, args.config);
  const inside = relative(dist, sourceConfig);
  assert.ok(
    inside && !inside.startsWith('..') && !isAbsolute(inside),
    `--config must point inside ${dist}`
  );
  const config = JSON.parse(await readFile(sourceConfig, 'utf8'));
  const require = createRequire(join(artifact, 'package.json'));
  const { unstable_startWorker: startWorker } = require('wrangler');

  const scratch = await realpath(
    await mkdtemp(join(tmpdir(), `pre-seal-doctor-${args.app}-`))
  );
  let worker;
  let finished = false;
  const cleanup = async () => {
    if (finished) return;
    finished = true;
    if (worker)
      await Promise.race([
        worker.dispose().catch(() => undefined),
        new Promise((done) => setTimeout(done, 5000).unref()),
      ]);
    await rm(scratch, { recursive: true, force: true });
  };
  const timer = setTimeout(async () => {
    console.error(
      `pre-seal doctor FAILED: ${args.app} did not answer within ${HARD_TIMEOUT_MS / 1000}s`
    );
    await cleanup();
    process.exit(1);
  }, HARD_TIMEOUT_MS);
  const onSignal = async (signal) => {
    await cleanup();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    // A disposable copy so runtime state never touches the artifact to seal.
    await cp(dist, join(scratch, 'dist'), {
      recursive: true,
      verbatimSymlinks: true,
    });
    const envFile = join(scratch, 'synthetic.env');
    await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
    const egress = [];
    worker = await startWorker({
      config: join(scratch, 'dist', inside),
      envFiles: [envFile],
      sendMetrics: false,
      bindings: syntheticBindings(config),
      build: { bundle: false, processEntrypoint: false },
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
          throw new Error('Provider auth is forbidden in the pre-seal doctor');
        },
        outboundService: (request) => {
          egress.push(new URL(request.url).origin);
          return new Response('{"error":"denied by the pre-seal doctor"}', {
            status: 599,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    });
    await worker.ready;
    const origin = (await worker.url).origin;
    const root = await call(origin, '/', args.host);
    const identity = await call(origin, '/api/build-info', args.host);
    const problems = [
      ...judgeRoot(root, args),
      ...judgeBuildInfo(identity, args),
    ];
    log(`GET /               Host ${args.host} -> ${describe(root)}`);
    log(`GET /api/build-info Host ${args.host} -> ${identity.status}`);
    if (problems.length) {
      const extra = egress.length
        ? ` (blocked ${egress.length} outbound request(s))`
        : '';
      throw new Error(
        `pre-seal doctor FAILED for ${args.app} at ${args.host}; do not seal${extra}\n${problems.map((p) => `  - ${p}`).join('\n')}`
      );
    }
    log(
      `pre-seal doctor passed for ${args.app} at ${args.host} (commit ${args.sha})`
    );
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await cleanup();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runDoctor(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
