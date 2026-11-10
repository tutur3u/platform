/**
 * Pre-seal doctor for the roadmap Worker.
 *
 * Serves the built worker on loopback and probes it with Host tuturuuu.com
 * and Host roadmap.tuturuuu.com. A passing live probe is not enough: the same
 * checker must reject a broken variant (D79) before the artifact is sealed.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const STAGE_LABELS = [
  'Planned',
  'Rolling out',
  'Waiting for merge',
  'Waiting for prod sync',
  'Live',
];

const LOGO = 'https://tuturuuu.com/media/logos/transparent.png';

export function assessDoctor(observation) {
  const failures = [];
  const canonical = observation.canonical ?? {};
  const body = String(canonical.body ?? '');
  if (canonical.status !== 200) {
    failures.push(`canonical status ${canonical.status}, expected 200`);
  }
  if (!body.includes('aria-label="Tuturuuu"')) {
    failures.push('canonical HTML missing Tuturuuu branding');
  }
  if (!body.includes(LOGO)) {
    failures.push('canonical HTML missing the Tuturuuu logo');
  }
  if (!body.includes('public-satellite-shell')) {
    failures.push('canonical HTML missing the shared satellite shell');
  }
  if (
    !body.includes('https://tuturuuu.com/login') ||
    !body.includes('Sign in')
  ) {
    failures.push('canonical HTML missing the optional sign-in link');
  }
  for (const label of STAGE_LABELS) {
    if (!body.includes(label)) {
      failures.push(`canonical HTML missing stage "${label}"`);
    }
  }
  const cache = String(canonical.cacheControl ?? '');
  if (
    !/s-maxage=300/.test(cache) ||
    !/stale-while-revalidate=86400/.test(cache)
  ) {
    failures.push(`canonical HTML cache-control ${cache || '(missing)'}`);
  }
  const satellite = observation.satellite ?? {};
  if (satellite.status !== 301) {
    failures.push(`satellite status ${satellite.status}, expected 301`);
  }
  if (satellite.location !== 'https://tuturuuu.com/roadmap/') {
    failures.push(`satellite location ${satellite.location ?? '(missing)'}`);
  }
  const query = observation.satelliteQuery ?? {};
  if (query.status !== 301) {
    failures.push(`satellite query status ${query.status}, expected 301`);
  }
  if (query.location !== 'https://tuturuuu.com/roadmap/notes?x=1') {
    failures.push(`satellite query location ${query.location ?? '(missing)'}`);
  }
  const buildInfo = observation.buildInfo ?? {};
  if (buildInfo.status !== 200) {
    failures.push(`build-info status ${buildInfo.status}, expected 200`);
  }
  if (buildInfo.commit !== observation.expectedCommit) {
    failures.push(
      `build-info commit ${buildInfo.commit ?? '(missing)'}, expected ${observation.expectedCommit}`
    );
  }
  const assetCache = String(observation.asset?.cacheControl ?? '');
  if (!observation.asset?.url) {
    failures.push('canonical HTML did not reference a hashed asset');
  } else if (!/\bimmutable\b/.test(assetCache)) {
    failures.push(
      `hashed asset cache-control ${assetCache || '(missing)'} for ${observation.asset.url}`
    );
  }
  return { ok: failures.length === 0, failures };
}

export function brokenVariant(observation) {
  return {
    ...observation,
    satellite: { status: 200, location: null },
    buildInfo: { ...observation.buildInfo, commit: '0'.repeat(40) },
  };
}

function appRoot() {
  return fileURLToPath(new URL('..', import.meta.url));
}

function hashedAsset(html) {
  const match = String(html).match(
    /\/roadmap\/assets\/[^"'\\\s>]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+/
  );
  return match?.[0] ?? null;
}

function headerValue(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** node:http keeps the Host header. fetch() strips it. */
function probe(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: { host },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            location: headerValue(response.headers.location),
            cacheControl: headerValue(response.headers['cache-control']),
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

export async function observeWorker(port, expectedCommit) {
  const canonical = await probe(port, '/roadmap/', 'tuturuuu.com');
  const satellite = await probe(port, '/', 'roadmap.tuturuuu.com');
  const satelliteQuery = await probe(
    port,
    '/notes?x=1',
    'roadmap.tuturuuu.com'
  );
  const buildInfoResponse = await probe(
    port,
    '/roadmap/api/build-info',
    'tuturuuu.com'
  );
  let commit = null;
  try {
    commit = JSON.parse(buildInfoResponse.body).commit ?? null;
  } catch {
    commit = null;
  }
  const assetPath = hashedAsset(canonical.body);
  const asset = assetPath
    ? await probe(port, assetPath, 'tuturuuu.com')
    : { url: null };
  return {
    expectedCommit,
    canonical,
    satellite,
    satelliteQuery,
    buildInfo: { status: buildInfoResponse.status, commit },
    asset: assetPath
      ? {
          url: assetPath,
          cacheControl: asset.cacheControl,
          status: asset.status,
        }
      : { url: null },
  };
}

function findWorkerConfig(root) {
  for (const relative of ['dist/server/wrangler.json', 'dist/wrangler.json']) {
    const path = join(root, relative);
    if (existsSync(path)) return path;
  }
  return null;
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Doctor server did not bind a TCP port');
  }
  return address.port;
}

/**
 * Serve the built worker. Prefer the emitted Wrangler config. Fall back to
 * the source entry only when the build already replaced its server import,
 * which the caller checks by requiring dist/client.
 */
export async function startBuiltWorker(root = appRoot()) {
  const client = join(root, 'dist/client/roadmap');
  if (!existsSync(client)) {
    throw new Error(
      'Built client is missing. Run build:cloudflare before the pre-seal doctor.'
    );
  }
  const config = findWorkerConfig(root);
  if (config) {
    return startWrangler(root, config);
  }
  return startInProcess();
}

function startWrangler(root, config) {
  const port = 18080 + Math.floor(Math.random() * 1000);
  const child = spawn(
    'bunx',
    [
      'wrangler',
      'dev',
      '--config',
      config,
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
      '--local',
      '--show-interactive-dev-session=false',
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let logs = '';
  const append = (chunk) => {
    logs += chunk.toString();
    if (logs.length > 20000) logs = logs.slice(-20000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Wrangler did not become ready\n${logs}`));
    }, 90000);
    const watch = () => {
      if (/Ready on http:\/\/127\.0\.0\.1:\d+/.test(logs)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', watch);
    child.stderr.on('data', watch);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Wrangler exited ${code} before ready\n${logs}`));
    });
  });
  return {
    port,
    ready,
    async stop() {
      child.kill('SIGTERM');
      await once(child, 'exit').catch(() => undefined);
    },
  };
}

async function startInProcess() {
  const workerUrl = new URL('../src/worker.ts', import.meta.url);
  const worker = await import(workerUrl.href);
  const server = createServer(async (incoming, outgoing) => {
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (name.toLowerCase() === 'host' || typeof value !== 'string')
          continue;
        headers.set(name, value);
      }
      const host = headerValue(incoming.headers.host);
      const publicHost =
        host === 'tuturuuu.com' || host === 'roadmap.tuturuuu.com'
          ? host
          : null;
      const target = publicHost
        ? `https://${publicHost}${incoming.url ?? '/'}`
        : `http://127.0.0.1${incoming.url ?? '/'}`;
      const response = await worker.default.fetch(
        new Request(target, {
          headers,
          method: incoming.method,
        })
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      const out = {};
      response.headers.forEach((value, name) => {
        out[name] = value;
      });
      outgoing.writeHead(response.status, out);
      outgoing.end(bytes);
    } catch (error) {
      outgoing.writeHead(500, { 'content-type': 'text/plain' });
      outgoing.end(error instanceof Error ? error.message : 'doctor error');
    }
  });
  const port = await listen(server);
  return {
    port,
    ready: Promise.resolve(),
    async stop() {
      server.close();
      await once(server, 'close').catch(() => undefined);
    },
  };
}

export function reportBrokenVariant(observation) {
  const broken = assessDoctor(brokenVariant(observation));
  const lines = ['D79 broken variant rejected:'];
  for (const failure of broken.failures) lines.push(`- ${failure}`);
  if (broken.ok) lines.push('- broken variant was accepted');
  return { ok: !broken.ok, lines, failures: broken.failures };
}

async function main() {
  const root = appRoot();
  const expectedCommit =
    process.env.ROADMAP_SOURCE_SHA ?? process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(expectedCommit ?? '')) {
    console.error('ROADMAP_SOURCE_SHA must be the 40-character build commit');
    process.exit(2);
  }
  const running = await startBuiltWorker(root);
  try {
    await running.ready;
    const observation = await observeWorker(running.port, expectedCommit);
    const verdict = assessDoctor(observation);
    for (const failure of verdict.failures) console.error(`- ${failure}`);
    const broken = reportBrokenVariant(
      verdict.ok
        ? observation
        : {
            ...observation,
            canonical: {
              status: 200,
              body: `<div class="public-satellite-shell" aria-label="Tuturuuu">${LOGO} Sign in https://tuturuuu.com/login ${STAGE_LABELS.join(' ')} /roadmap/assets/index-CGgt8iCG.js</div>`,
              cacheControl: 'public,s-maxage=300,stale-while-revalidate=86400',
            },
            satellite: {
              status: 301,
              location: 'https://tuturuuu.com/roadmap/',
            },
            satelliteQuery: {
              status: 301,
              location: 'https://tuturuuu.com/roadmap/notes?x=1',
            },
            buildInfo: { status: 200, commit: expectedCommit },
            asset: {
              url: '/roadmap/assets/index-CGgt8iCG.js',
              cacheControl: 'public, max-age=31536000, immutable',
            },
            expectedCommit,
          }
    );
    for (const line of broken.lines) console.error(line);
    if (!verdict.ok || !broken.ok) process.exit(1);
    console.log(
      `pre-seal doctor passed for ${expectedCommit} on 127.0.0.1:${running.port}`
    );
  } finally {
    await running.stop();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error
    );
    process.exit(1);
  });
}
