/**
 * Pre-seal doctor for the roadmap Worker.
 *
 * Serves the built worker in workerd (miniflare) behind a loopback HTTP server
 * and probes it with Host tuturuuu.com and Host roadmap.tuturuuu.com. A passing live probe is not enough: the same
 * checker must reject a broken variant (D79) before the artifact is sealed.
 */
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Miniflare, supportedCompatibilityDate } from 'miniflare';
import { showPlans } from '../src/content/tracks.ts';
import { inlineScriptTexts } from '../src/html-scripts.ts';
import * as markup from './doctor-markup.mjs';
import {
  reportAssetSmokeRejection,
  smokeAssets,
} from '../../../scripts/ci/asset-smoke.mjs';

export const STAGE_LABELS = [
  'Planned',
  'In progress',
  'Waiting for merge',
  'Waiting for prod sync',
  'Live',
];

/** The plans card follows the single `showPlans` content flag. */
export const PLAN_LABEL = 'Mira subscription plans';

/** The logo ships inside the roadmap mount; the apex /media path is not ours. */
export const MOUNTED_LOGO =
  /<img\b[^>]*\bsrc="\/roadmap\/assets\/tuturuuu-logo-[A-Za-z0-9_-]{8,}\.png"/;

/** Canonical: no trailing slash, like every Tuturuuu URL. */
export const CANONICAL_URL = 'https://tuturuuu.com/roadmap';

/** Every public page and language; each must render and load cleanly. */
export const PUBLIC_DOCUMENT_PATHS = [
  '/roadmap',
  '/roadmap/vi',
  '/roadmap/workshops/edufest-2026',
  '/roadmap/vi/workshops/edufest-2026',
];

export const speculativeLinks = markup.speculativeLinks;
const SPEED_BRAIN =
  'Cloudflare Speed Brain answers Sec-Purpose: prefetch with 503 on tuturuuu.com';

/** Every slash or satellite form reaches the canonical in exactly one 301. */
export const REDIRECT_CHAINS = [
  { host: 'tuturuuu.com', path: '/roadmap/', location: CANONICAL_URL },
  {
    host: 'tuturuuu.com',
    path: '/roadmap/?q=1',
    location: `${CANONICAL_URL}?q=1`,
  },
  {
    host: 'tuturuuu.com',
    path: '/roadmap/notes/',
    location: `${CANONICAL_URL}/notes`,
  },
  { host: 'roadmap.tuturuuu.com', path: '/', location: CANONICAL_URL },
  {
    host: 'roadmap.tuturuuu.com',
    path: '/roadmap/?x=1',
    location: `${CANONICAL_URL}?x=1`,
  },
  {
    host: 'roadmap.tuturuuu.com',
    path: '/notes/?x=1',
    location: `${CANONICAL_URL}/notes?x=1`,
  },
];

function canonicalFailures(observation, body) {
  const failures = [];
  if (!body.includes(`rel="canonical" href="${CANONICAL_URL}"`))
    failures.push(`canonical link is not ${CANONICAL_URL}`);
  if (!body.includes(`property="og:url" content="${CANONICAL_URL}"`))
    failures.push(`og:url is not ${CANONICAL_URL}`);
  if (
    !body.includes(`hrefLang="x-default" href="${CANONICAL_URL}"`) &&
    !body.includes(`hreflang="x-default" href="${CANONICAL_URL}"`)
  )
    failures.push('hreflang x-default is not the canonical URL');
  if (body.includes(`"${CANONICAL_URL}/"`))
    failures.push('HTML still references the trailing-slash URL');
  const seen = new Map(
    (observation.redirects ?? []).map((r) => [`${r.host}${r.path}`, r])
  );
  for (const expected of REDIRECT_CHAINS) {
    const actual = seen.get(`${expected.host}${expected.path}`);
    if (
      !actual ||
      actual.status !== 301 ||
      actual.location !== expected.location
    )
      failures.push(
        `${expected.host}${expected.path} answered ${actual?.status ?? '(missing)'} ${actual?.location ?? ''}, expected one 301 to ${expected.location}`
      );
  }
  return failures;
}

const REQUIRED_CSP = [
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
  "connect-src 'self' https://api.github.com",
];

/** sha256 of each real inline script (independent of the Worker's HTMLRewriter). */
export function inlineScriptHashes(html) {
  return inlineScriptTexts(String(html)).map(
    (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`
  );
}

/** Every SSR inline script must be allowed, and nothing broader. */
export function cspFailures(body, csp) {
  const policy = String(csp ?? '');
  if (!policy) return ['canonical HTML missing content-security-policy'];
  const failures = [];
  const scriptSrc =
    policy
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('script-src ')) ?? '';
  if (!scriptSrc) failures.push('CSP missing script-src');
  if (/'unsafe-inline'|'unsafe-eval'|\*|https?:/.test(scriptSrc))
    failures.push(`CSP script-src too broad: ${scriptSrc}`);
  for (const hash of inlineScriptHashes(body))
    if (!scriptSrc.split(/\s+/).includes(hash))
      failures.push(`CSP script-src does not allow inline script ${hash}`);
  for (const directive of REQUIRED_CSP)
    if (!policy.includes(directive)) failures.push(`CSP missing ${directive}`);
  return failures;
}

export function assessDoctor(observation) {
  const failures = [];
  const canonical = observation.canonical ?? {};
  const body = String(canonical.body ?? '');
  if (canonical.status !== 200) {
    failures.push(`canonical status ${canonical.status}, expected 200`);
  }
  // The shared marketing layout (@tuturuuu/marketing-shell), as on /home.
  for (const [marker, name] of [
    ['id="navbar"', 'the marketing navbar'],
    ['id="main-content"', 'the marketing main frame'],
    ['<footer', 'the marketing footer'],
    ['>Tuturuuu</span>', 'the Tuturuuu brand name'],
  ])
    if (!body.includes(marker)) failures.push(`canonical HTML missing ${name}`);
  failures.push(...markup.redundantAltFailures(body));
  failures.push(...markup.pendingBoundaryFailures(body));
  if (!MOUNTED_LOGO.test(body))
    failures.push('canonical HTML missing the mounted Tuturuuu logo');
  if (body.includes('public-satellite-shell'))
    failures.push('canonical HTML still uses the satellite shell');
  if (!body.includes('https://tuturuuu.com/login'))
    failures.push('canonical HTML missing the get-started link');
  // React marks a boundary it could not render on the server with <!--$!-->.
  // The browser recovers, but crawlers and link previews get an empty page.
  if (body.includes('<!--$!-->'))
    failures.push(
      'canonical HTML fell back to client rendering (server render failed)'
    );
  if (
    !/property="og:image" content="https:\/\/tuturuuu\.com\/roadmap\/assets\/[^"]+\.png"/.test(
      body
    )
  )
    failures.push('canonical HTML missing an absolute og:image');
  const plansShown = observation.showPlans ?? true;
  if (plansShown !== body.includes(PLAN_LABEL)) {
    failures.push(
      plansShown
        ? `canonical HTML missing "${PLAN_LABEL}" while showPlans is on`
        : `canonical HTML shows "${PLAN_LABEL}" while showPlans is off`
    );
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
  failures.push(...canonicalFailures(observation, body));
  failures.push(...cspFailures(body, canonical.csp));
  if (!body.includes('id="timeline-title"'))
    failures.push('canonical HTML missing the timeline');
  // The timeline fetches its history after mount: the asset must be emitted
  // and served as JSON from the canonical host, never speculatively loaded.
  const history = observation.history ?? {};
  if (!history.url) {
    failures.push('the build emitted no hashed history asset');
  } else if (
    history.status !== 200 ||
    !/^application\/json\b/.test(String(history.contentType ?? '')) ||
    !(history.bytes > 0)
  ) {
    failures.push(
      `hashed history asset ${history.url} status ${history.status} content-type ${history.contentType ?? '(missing)'} bytes ${history.bytes ?? 0}, expected 200 application/json`
    );
  }
  const documents = observation.documents ?? [];
  for (const path of PUBLIC_DOCUMENT_PATHS) {
    const document = documents.find((item) => item.path === path);
    if (!document) {
      failures.push(`${path} was not probed`);
      continue;
    }
    if (document.status !== 200)
      failures.push(`${path} status ${document.status}, expected 200`);
    for (const href of document.speculative ?? [])
      failures.push(`${path} speculatively loads ${href}: ${SPEED_BRAIN}`);
    failures.push(...markup.documentBudgetFailures(document));
    failures.push(...markup.inlineScriptFailures(document));
  }
  const satellite = observation.satellite ?? {};
  if (satellite.status !== 301) {
    failures.push(`satellite status ${satellite.status}, expected 301`);
  }
  if (satellite.location !== CANONICAL_URL) {
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
    redirects: [
      { path: '/roadmap/', host: 'tuturuuu.com', status: 200, location: null },
    ],
    buildInfo: { ...observation.buildInfo, commit: '0'.repeat(40) },
    // The production failure of 11 Nov 2026 (#8163): a prefetched history
    // asset that the zone answers with 503.
    history: { ...observation.history, status: 503, bytes: 0 },
    documents: (observation.documents ?? []).map((document) => ({
      ...document,
      size: markup.DOCUMENT_BUDGET + 1,
      scripts: { inline: markup.EXPECTED_INLINE_SCRIPTS + 1, uncovered: 1 },
      speculative: [
        ...(document.speculative ?? []),
        '/roadmap/assets/history-Abcd1234.json',
      ],
    })),
    canonical: {
      ...observation.canonical,
      // The production failure of 11 Nov 2026: a client-render fallback
      // with no preview image.
      body: `<!--$!--><template></template><!--/$-->${String(
        observation.canonical?.body ?? ''
      ).replaceAll('property="og:image"', 'property="og:missing"')}`,
    },
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
            csp: headerValue(response.headers['content-security-policy']),
            contentType: headerValue(response.headers['content-type']),
            bytes: Buffer.concat(chunks),
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/** The hashed history JSON the client build emitted, as a public path. */
export function emittedHistoryAsset(root = appRoot()) {
  const dir = join(root, 'dist/client/roadmap/assets');
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).find((name) =>
    /^history-[A-Za-z0-9_-]{8,}\.json$/.test(name)
  );
  return file ? `/roadmap/assets/${file}` : null;
}

export async function observeWorker(port, expectedCommit, root = appRoot()) {
  const canonical = await probe(port, '/roadmap', 'tuturuuu.com');
  const documents = [];
  for (const path of PUBLIC_DOCUMENT_PATHS) {
    const result = await probe(port, path, 'tuturuuu.com');
    documents.push({
      path,
      status: result.status,
      size: String(result.body).length,
      scripts: markup.scriptCoverage(
        inlineScriptHashes(result.body),
        result.csp
      ),
      speculative: speculativeLinks(result.body),
    });
  }
  const historyPath = emittedHistoryAsset(root);
  const historyResult = historyPath
    ? await probe(port, historyPath, 'tuturuuu.com')
    : null;
  const redirects = [];
  for (const expected of REDIRECT_CHAINS) {
    const result = await probe(port, expected.path, expected.host);
    redirects.push({
      path: expected.path,
      host: expected.host,
      status: result.status,
      location: result.location,
    });
  }
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
    showPlans,
    canonical,
    documents,
    history: historyResult
      ? {
          url: historyPath,
          status: historyResult.status,
          contentType: historyResult.contentType,
          bytes: historyResult.bytes.length,
        }
      : { url: null },
    satellite,
    satelliteQuery,
    redirects,
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
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.avif': 'image/avif',
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

/** Carries the probe's intended Host past miniflare, which sends loopback. */
const DOCTOR_HOST_HEADER = 'x-roadmap-doctor-host';

/**
 * First module: restores the Host a Cloudflare edge request would carry (or
 * none, like the old in-process probe) before the built worker sees it.
 */
const DOCTOR_ENTRY = `import worker from './index.js';
export default {
  fetch(request, env, ctx) {
    const headers = new Headers(request.headers);
    const host = headers.get('${DOCTOR_HOST_HEADER}');
    headers.delete('${DOCTOR_HOST_HEADER}');
    if (host) headers.set('host', host);
    else headers.delete('host');
    return worker.fetch(new Request(request, { headers }), env, ctx);
  },
};`;

/** Every module of the built worker; workerd needs them listed up front. */
function builtModules(serverRoot) {
  return [
    {
      type: 'ESModule',
      path: join(serverRoot, '__doctor-entry.js'),
      contents: DOCTOR_ENTRY,
    },
    ...readdirSync(serverRoot, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.js'))
      .map((file) => ({ type: 'ESModule', path: join(serverRoot, file) })),
  ];
}

/**
 * The worker's compatibility date, capped at what this workerd supports.
 * HTMLRewriter (the CSP's script collection) is not date-gated.
 */
export function doctorCompatibilityDate(
  configured,
  supported = supportedCompatibilityDate
) {
  return configured && configured <= supported ? configured : supported;
}

/**
 * Serve dist/server/index.js in workerd, the runtime Cloudflare runs it in
 * (Node has no HTMLRewriter, which the CSP needs). The Host header selects
 * the public contract.
 */
export async function startBuiltWorker(root = appRoot()) {
  const serverRoot = join(root, 'dist/server');
  const bundle = join(serverRoot, 'index.js');
  const client = join(root, 'dist/client/roadmap');
  if (!existsSync(bundle) || !existsSync(client)) {
    throw new Error(
      'Built worker is missing. Run build:cloudflare before the pre-seal doctor.'
    );
  }
  // The deployed Worker's runtime settings, from the app's own config.
  const { cloudflare: config } = (
    await import(pathToFileURL(join(root, 'void.config.ts')).href)
  ).default;
  const assets = localAssets(root);
  const worker = new Miniflare({
    modulesRoot: serverRoot,
    modules: builtModules(serverRoot),
    compatibilityDate: doctorCompatibilityDate(config.compatibility_date),
    compatibilityFlags: config.compatibility_flags ?? [],
    serviceBindings: { ASSETS: (request) => assets.fetch(request) },
  });
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
      const response = await worker.dispatchFetch(target, {
        method: incoming.method ?? 'GET',
        headers: publicHost ? { [DOCTOR_HOST_HEADER]: publicHost } : {},
        redirect: 'manual',
      });
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
      await worker.dispose();
    },
  };
}

function responseFromProbe(result) {
  const headers = new Headers();
  if (result.contentType) headers.set('content-type', result.contentType);
  if (result.location) headers.set('location', result.location);
  if (result.cacheControl) headers.set('cache-control', result.cacheControl);
  // Keep raw bytes so binary assets (images) are checked as served.
  return new Response(result.bytes ?? result.body ?? '', {
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
  ...PUBLIC_DOCUMENT_PATHS.map((path) => ({
    url: `https://tuturuuu.com${path}`,
    status: 200,
  })),
  {
    url: 'https://tuturuuu.com/roadmap/',
    status: 301,
    location: CANONICAL_URL,
  },
  {
    url: 'https://roadmap.tuturuuu.com/',
    status: 301,
    location: CANONICAL_URL,
  },
  {
    url: 'https://roadmap.tuturuuu.com/roadmap',
    status: 301,
    location: CANONICAL_URL,
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
              body: `<header id="navbar"><img alt="" src="/roadmap/assets/tuturuuu-logo-Abcd1234.png"><span>Tuturuuu</span></header><div id="main-content"></div><footer></footer> https://tuturuuu.com/login ${STAGE_LABELS.join(' ')} /roadmap/assets/index-CGgt8iCG.js</div>`,
              cacheControl: 'public,s-maxage=300,stale-while-revalidate=86400',
            },
            satellite: {
              status: 301,
              location: CANONICAL_URL,
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
    for (const line of markup.documentBudgetReport(observation.documents))
      console.log(line);
    const assetSmoke = await smokeAssets({
      pages: DOCTOR_ASSET_PAGES,
      canonicalOrigin: 'https://tuturuuu.com',
      fetchImpl: doctorFetch(running.port),
    });
    for (const failure of assetSmoke.failures) console.error(`- ${failure}`);
    const smoke = await markup.builtWorkerSmoke(doctorFetch(running.port));
    const brokenAssets = await smokeAssets({
      pages: [CANONICAL_URL],
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
    if (
      !verdict.ok ||
      !broken.ok ||
      !assetSmoke.ok ||
      brokenAssets.ok ||
      !smoke.ok
    ) {
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
