/**
 * Pre-seal doctor for the roadmap Worker.
 *
 * Serves the built worker on loopback and probes it with Host tuturuuu.com
 * and Host roadmap.tuturuuu.com. A passing live probe is not enough: the same
 * checker must reject a broken variant (D79) before the artifact is sealed.
 */
import { once } from 'node:events';
import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { registerHooks } from 'node:module';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  reportAssetSmokeRejection,
  smokeAssets,
} from '../../../scripts/ci/asset-smoke.mjs';

const CLOUDFLARE_WORKERS_STUB = new URL(
  './cloudflare-workers-stub.mjs',
  import.meta.url
);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') {
      return { url: CLOUDFLARE_WORKERS_STUB.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

export const STAGE_LABELS = [
  'Planned',
  'In progress',
  'Waiting for merge',
  'Waiting for prod sync',
  'Live',
  'Mira subscription plans',
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
            contentType: headerValue(response.headers['content-type']),
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

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Doctor server did not bind a TCP port');
  }
  return address.port;
}

function clientFile(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  // path.join treats a leading slash as absolute and drops the client root.
  const relative = decoded.replace(/^\/+/, '');
  if (
    relative === '' ||
    relative.includes('\0') ||
    relative.split('/').includes('..')
  ) {
    return null;
  }
  const clientRoot = realpathSync(join(root, 'dist/client'));
  const file = join(clientRoot, relative);
  if (!file.startsWith(`${clientRoot}${sep}`)) return null;
  if (!existsSync(file)) return null;
  return realpathSync(file).startsWith(`${clientRoot}${sep}`) ? file : null;
}

const ASSET_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
};

function localAssets(root) {
  return {
    async fetch(request) {
      const file = clientFile(root, new URL(request.url).pathname);
      if (!file) return new Response(null, { status: 404 });
      const extension = file.slice(file.lastIndexOf('.'));
      const body = request.method === 'HEAD' ? null : await readFile(file);
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': ASSET_TYPES[extension] ?? 'application/octet-stream',
        },
      });
    },
  };
}

/** Serve dist/server/index.js. The Host header selects the public contract. */
export async function startBuiltWorker(root = appRoot()) {
  const bundle = join(root, 'dist/server/index.js');
  const client = join(root, 'dist/client/roadmap');
  if (!existsSync(bundle) || !existsSync(client)) {
    throw new Error(
      'Built worker is missing. Run build:cloudflare before the pre-seal doctor.'
    );
  }
  const worker = await import(pathToFileURL(bundle).href);
  const env = { ASSETS: localAssets(root) };
  const server = createServer(async (incoming, outgoing) => {
    try {
      const host = headerValue(incoming.headers.host);
      const publicHost =
        host === 'tuturuuu.com' || host === 'roadmap.tuturuuu.com'
          ? host
          : null;
      const target = publicHost
        ? `https://${publicHost}${incoming.url ?? '/'}`
        : `http://127.0.0.1${incoming.url ?? '/'}`;
      const response = await worker.default.fetch(
        new Request(target, { method: incoming.method ?? 'GET' }),
        env,
        { waitUntil() {}, passThroughOnException() {} }
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      const out = {};
      response.headers.forEach((value, name) => {
        out[name] = value;
      });
      outgoing.writeHead(response.status, out);
      outgoing.end(incoming.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
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

function responseFromProbe(result) {
  const headers = new Headers();
  if (result.contentType) headers.set('content-type', result.contentType);
  if (result.location) headers.set('location', result.location);
  if (result.cacheControl) headers.set('cache-control', result.cacheControl);
  return new Response(result.body ?? '', {
    status: result.status || 500,
    headers,
  });
}

/** Host-selected fetch for the asset smoke. node:http keeps the Host header. */
export function doctorFetch(port) {
  return async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const probed = await probe(port, `${url.pathname}${url.search}`, url.host);
    return responseFromProbe(probed);
  };
}

const DOCTOR_ASSET_PAGES = [
  {
    url: 'https://tuturuuu.com/roadmap',
    redirectsTo: 'https://tuturuuu.com/roadmap/',
  },
  { url: 'https://tuturuuu.com/roadmap/', status: 200 },
  {
    url: 'https://roadmap.tuturuuu.com/',
    status: 301,
    location: 'https://tuturuuu.com/roadmap/',
  },
  {
    url: 'https://roadmap.tuturuuu.com/roadmap',
    status: 301,
    location: 'https://tuturuuu.com/roadmap/',
  },
];

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
    const assetSmoke = await smokeAssets({
      pages: DOCTOR_ASSET_PAGES,
      canonicalOrigin: 'https://tuturuuu.com',
      fetchImpl: doctorFetch(running.port),
    });
    for (const failure of assetSmoke.failures) console.error(`- ${failure}`);
    const brokenAssets = await smokeAssets({
      pages: ['https://tuturuuu.com/roadmap/'],
      canonicalOrigin: 'https://tuturuuu.com',
      fetchImpl: async (url) => {
        const target = String(url);
        if (target.endsWith('.css')) {
          return new Response('<html>missing</html>', {
            status: 404,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }
        return new Response(
          '<link rel="stylesheet" href="/roadmap/assets/styles-Abcd1234.css">',
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }
        );
      },
    });
    const assetRejection = reportAssetSmokeRejection(brokenAssets);
    console.error(assetRejection);
    if (!verdict.ok || !broken.ok || !assetSmoke.ok || brokenAssets.ok) {
      process.exit(1);
    }
    console.log(
      `pre-seal doctor passed for ${expectedCommit} on 127.0.0.1:${running.port}`
    );
  } finally {
    await running.stop();
  }
}

function isDirectRun() {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(arg);
  } catch {
    return import.meta.url === pathToFileURL(arg).href;
  }
}

if (isDirectRun()) {
  await main();
}
