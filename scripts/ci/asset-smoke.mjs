import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Gateway asset smoke.
 *
 * Fetch each document, follow at most one redirect, then request every CSS,
 * JS, font, <img> and icon-link URL it references. Those assets must return
 * 200 with the matching MIME type on the canonical origin; images must also
 * have a non-empty body. A second redirect is a chain. A 404, text/html,
 * application/octet-stream or zero-byte image is not an asset.
 *
 *   node scripts/ci/asset-smoke.mjs \
 *     --canonical-origin https://tuturuuu.com \
 *     --page https://tuturuuu.com/roadmap/ \
 *     --page https://roadmap.tuturuuu.com/
 *
 * D15 (`scripts/cutover-smoke.mjs`) runs the same check when an app's
 * cutover config sets `assetSmoke`. The roadmap pre-seal doctor calls
 * `smokeAssets` against the built Worker.
 */
const REDIRECT = new Set([301, 302, 303, 307, 308]);
const FONT_TYPES = new Set([
  'application/font-woff',
  'application/font-woff2',
  'application/vnd.ms-fontobject',
  'application/x-font-opentype',
  'application/x-font-ttf',
  'application/x-font-woff',
]);
const JS_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'text/ecmascript',
  'text/javascript',
]);

const KIND_LABEL = {
  css: 'stylesheet',
  js: 'script',
  font: 'font',
  image: 'image',
};
const EXPECTED_TYPE = {
  css: 'text/css',
  js: 'text/javascript or application/javascript',
  font: 'font/*',
  image: 'non-empty image/*',
};

export function contentTypeValue(header) {
  return String(header ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

export function mimeMatches(kind, header) {
  const value = contentTypeValue(header);
  if (!value || value === 'text/html' || value === 'application/octet-stream') {
    return false;
  }
  if (kind === 'css') return value === 'text/css';
  if (kind === 'js') return JS_TYPES.has(value);
  if (kind === 'font')
    return value.startsWith('font/') || FONT_TYPES.has(value);
  if (kind === 'image') return value.startsWith('image/');
  return false;
}

function kindFromPath(reference) {
  const path = String(reference).split(/[?#]/)[0].toLowerCase();
  if (path.endsWith('.css')) return 'css';
  if (/\.(?:js|mjs|cjs)$/.test(path)) return 'js';
  if (/\.(?:woff2?|ttf|otf|eot)$/.test(path)) return 'font';
  return null;
}

function readAttributes(source) {
  const attrs = new Map();
  const re = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const match of source.matchAll(re)) {
    const name = match[1].toLowerCase();
    if (!attrs.has(name))
      attrs.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function kindFromLink(attrs) {
  const rel = new Set(
    (attrs.get('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  );
  if (!attrs.get('href')) return null;
  if (['icon', 'apple-touch-icon', 'mask-icon'].some((name) => rel.has(name)))
    return 'image';
  const as = (attrs.get('as') ?? '').toLowerCase();
  if (rel.has('stylesheet')) return 'css';
  if (rel.has('modulepreload')) return 'js';
  if (!rel.has('preload') && !rel.has('prefetch')) return null;
  if (as === 'style' || as === 'stylesheet') return 'css';
  if (as === 'script') return 'js';
  if (as === 'font') return 'font';
  return kindFromPath(attrs.get('href'));
}

/** CSS, JS, font, <img> and icon references in an HTML document. External hosts stay absolute. */
export function extractHtmlAssets(html) {
  const found = [];
  for (const match of String(html).matchAll(/<(link|script|img)\b([^>]*)>/gi)) {
    const attrs = readAttributes(match[2]);
    if (match[1].toLowerCase() === 'img') {
      const src = attrs.get('src');
      if (src) found.push({ reference: src, kind: 'image' });
      continue;
    }
    if (match[1].toLowerCase() === 'script') {
      const src = attrs.get('src');
      if (src) found.push({ reference: src, kind: 'js' });
      continue;
    }
    const kind = kindFromLink(attrs);
    if (kind) found.push({ reference: attrs.get('href'), kind });
  }
  return found;
}

/** Stylesheet url() and @import references. data: URLs are ignored. */
export function extractCssAssets(css) {
  const found = [];
  const source = String(css);
  for (const match of source.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
    const reference = match[2].trim();
    if (/^data:/i.test(reference)) continue;
    const kind = kindFromPath(reference);
    if (kind) found.push({ reference, kind });
  }
  for (const match of source.matchAll(
    /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)/gi
  )) {
    const reference = (match[2] ?? match[4] ?? '').trim();
    if (reference && !/^data:/i.test(reference)) {
      found.push({ reference, kind: 'css' });
    }
  }
  return found;
}

function pageSpec(page, origin) {
  if (typeof page === 'string') return { url: new URL(page, origin).href };
  const url = page.url
    ? new URL(page.url, origin).href
    : new URL(page.path, origin).href;
  const spec = { url };
  if (page.status != null) spec.status = page.status;
  if (page.location) spec.location = new URL(page.location, origin).href;
  if (page.redirectsTo) {
    spec.redirectsTo = new URL(page.redirectsTo, origin).href;
  }
  return spec;
}

/**
 * Pages for one D15 run. Satellite pages are included only when the base host
 * is the configured canonical host, so a preview smoke does not fetch production.
 */
export function resolveAssetSmokePlan(spec, baseUrl) {
  if (!spec || typeof spec !== 'object') {
    throw new Error('asset smoke spec is required');
  }
  const base = new URL(baseUrl);
  const declared = spec.canonicalOrigin ? new URL(spec.canonicalOrigin) : base;
  const onCanonical = base.host === declared.host;
  const origin = onCanonical ? declared.origin : base.origin;
  const pages = (spec.pages ?? []).map((page) => pageSpec(page, origin));
  if (onCanonical) {
    for (const page of spec.satellitePages ?? []) {
      pages.push(pageSpec(page, origin));
    }
  }
  return { canonicalOrigin: origin, pages };
}

function allowedHosts(pages, canonicalOrigin) {
  const hosts = new Set([new URL(canonicalOrigin).host]);
  for (const page of pages) {
    try {
      hosts.add(new URL(page.url).host);
    } catch {
      // pageSpec already rejects a bad document URL before assets are resolved.
    }
  }
  return hosts;
}

function assetUrl(reference, baseUrl, canonicalOrigin, hosts) {
  if (/^(?:data|blob|javascript):/i.test(reference)) return null;
  let resolved;
  try {
    resolved = new URL(reference, baseUrl);
  } catch {
    return { error: `unresolved asset reference ${reference}` };
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    return null;
  }
  const canonical = new URL(canonicalOrigin);
  if (resolved.host === canonical.host) return { url: resolved.href };
  if (hosts.has(resolved.host)) {
    return {
      url: new URL(`${resolved.pathname}${resolved.search}`, canonical.origin)
        .href,
    };
  }
  return null;
}

async function request(fetchImpl, url, timeoutMs) {
  try {
    return await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { failed: true, message };
  }
}

function header(response, name) {
  return response.headers?.get?.(name) ?? null;
}

function hopFailures(spec, response) {
  const failures = [];
  const location = header(response, 'location');
  const resolved = location ? new URL(location, spec.url).href : null;
  if (spec.status != null && response.status !== spec.status) {
    failures.push(
      `${spec.url} status ${response.status}, expected ${spec.status}`
    );
  }
  if (spec.location && resolved !== spec.location) {
    failures.push(
      `${spec.url} location ${resolved ?? '(missing)'}, expected ${spec.location}`
    );
  }
  if (spec.redirectsTo) {
    if (!REDIRECT.has(response.status)) {
      failures.push(
        `${spec.url} status ${response.status}, expected one redirect to ${spec.redirectsTo}`
      );
    } else if (resolved !== spec.redirectsTo) {
      failures.push(
        `${spec.url} location ${resolved ?? '(missing)'}, expected ${spec.redirectsTo}`
      );
    }
  }
  if (spec.status === 200 && REDIRECT.has(response.status)) {
    failures.push(
      `${spec.url} redirected to ${resolved ?? '(missing)'}, expected 200`
    );
  }
  return failures;
}

async function loadDocument(spec, fetchImpl, timeoutMs) {
  const failures = [];
  const hops = [spec.url];
  let current = spec.url;
  let response = await request(fetchImpl, current, timeoutMs);
  if (response.failed) {
    return {
      failures: [`${spec.url} fetch failed: ${response.message}`],
      html: '',
      hops,
    };
  }
  failures.push(...hopFailures(spec, response));
  let redirects = 0;
  while (REDIRECT.has(response.status) && redirects < 2) {
    const location = header(response, 'location');
    if (!location) {
      failures.push(`${current} redirect missing location`);
      break;
    }
    current = new URL(location, current).href;
    hops.push(current);
    redirects += 1;
    response = await request(fetchImpl, current, timeoutMs);
    if (response.failed) {
      failures.push(`${current} fetch failed: ${response.message}`);
      return { failures, html: '', hops };
    }
    if (redirects > 1 && REDIRECT.has(response.status)) {
      const next = header(response, 'location');
      const tail = next ? ` -> ${new URL(next, current).href}` : '';
      failures.push(`redirect chain ${hops.join(' -> ')}${tail}`);
    } else if (redirects > 1) {
      failures.push(`redirect chain ${hops.join(' -> ')}`);
    }
  }
  if (response.status !== 200) {
    failures.push(`${spec.url} final status ${response.status}, expected 200`);
    return { failures, html: '', hops };
  }
  const type = contentTypeValue(header(response, 'content-type'));
  if (type !== 'text/html') {
    failures.push(
      `${current} content-type ${type || '(missing)'}, expected text/html`
    );
  }
  const html = typeof response.text === 'function' ? await response.text() : '';
  return { failures, html, hops, finalUrl: current };
}

async function readAsset(fetchImpl, url, timeoutMs, kind) {
  const response = await request(fetchImpl, url, timeoutMs);
  if (response.failed) {
    return { failed: true, message: response.message };
  }
  const type = header(response, 'content-type');
  if (kind === 'image') {
    const bytes =
      response.status === 200 && typeof response.arrayBuffer === 'function'
        ? (await response.arrayBuffer()).byteLength
        : 0;
    return { status: response.status, type, body: '', bytes };
  }
  const body =
    response.status === 200 && typeof response.text === 'function'
      ? await response.text()
      : '';
  return { status: response.status, type, body, bytes: body.length };
}

export async function smokeAssets({
  pages,
  canonicalOrigin,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
}) {
  if (!canonicalOrigin) throw new Error('canonicalOrigin is required');
  const specs = (pages ?? []).map((page) =>
    typeof page === 'string' || page?.path || page?.url
      ? pageSpec(page, canonicalOrigin)
      : page
  );
  if (specs.length === 0) throw new Error('at least one page is required');
  const hosts = allowedHosts(specs, canonicalOrigin);
  const failures = [];
  const assets = [];
  const seen = new Set();
  const queue = [];

  for (const spec of specs) {
    const document = await loadDocument(spec, fetchImpl, timeoutMs);
    failures.push(...document.failures);
    if (!document.html) continue;
    const references = extractHtmlAssets(document.html);
    let kept = 0;
    for (const reference of references) {
      const resolved = assetUrl(
        reference.reference,
        document.finalUrl ?? spec.url,
        canonicalOrigin,
        hosts
      );
      if (!resolved) continue;
      if (resolved.error) {
        failures.push(resolved.error);
        continue;
      }
      kept += 1;
      const key = `${reference.kind} ${resolved.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ url: resolved.url, kind: reference.kind, depth: 0 });
    }
    if (kept === 0) {
      failures.push(`${spec.url} referenced no css, js or font URL`);
    }
  }

  while (queue.length > 0) {
    const item = queue.shift();
    const asset = await readAsset(fetchImpl, item.url, timeoutMs, item.kind);
    if (asset.failed) {
      failures.push(
        `${KIND_LABEL[item.kind]} ${item.url} fetch failed: ${asset.message}`
      );
      assets.push({ url: item.url, kind: item.kind, status: 0, ok: false });
      continue;
    }
    const ok =
      asset.status === 200 &&
      mimeMatches(item.kind, asset.type) &&
      (item.kind !== 'image' || asset.bytes > 0);
    assets.push({
      url: item.url,
      kind: item.kind,
      status: asset.status,
      contentType: contentTypeValue(asset.type) || null,
      ok,
    });
    if (!ok) {
      failures.push(
        `${KIND_LABEL[item.kind]} ${item.url} status ${asset.status} content-type ${contentTypeValue(asset.type) || '(missing)'}${item.kind === 'image' ? ` bytes ${asset.bytes}` : ''}, expected 200 ${EXPECTED_TYPE[item.kind]}`
      );
      continue;
    }
    if (item.kind !== 'css' || item.depth >= 4) continue;
    for (const nested of extractCssAssets(asset.body)) {
      const resolved = assetUrl(
        nested.reference,
        item.url,
        canonicalOrigin,
        hosts
      );
      if (!resolved || resolved.error) {
        if (resolved?.error) failures.push(resolved.error);
        continue;
      }
      const key = `${nested.kind} ${resolved.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({
        url: resolved.url,
        kind: nested.kind,
        depth: item.depth + 1,
      });
    }
  }

  return { ok: failures.length === 0, failures, assets };
}

export function reportAssetSmokeRejection(result) {
  const lines = ['D79 asset smoke rejected:'];
  for (const failure of result?.failures ?? []) lines.push(`- ${failure}`);
  if (result?.ok) lines.push('- broken asset response was accepted');
  return lines.join('\n');
}

export function parseAssetSmokeArgs(argv) {
  const pages = [];
  let canonicalOrigin = null;
  let timeoutMs = 10_000;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--page') pages.push(argv[++index]);
    else if (arg === '--canonical-origin') canonicalOrigin = argv[++index];
    else if (arg === '--timeout')
      timeoutMs = Number(argv[++index]) || timeoutMs;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return { pages, canonicalOrigin, timeoutMs, help };
}

const HELP = `Usage:
  node scripts/ci/asset-smoke.mjs --canonical-origin <origin> --page <url> [--page <url> ...]

Fetches each page and every CSS, JS and font URL it references. Assets are
requested on the canonical origin and must return 200 with the matching MIME
type. One document redirect is allowed. A second redirect fails the check.

D15 runs this for any app whose cutover config sets assetSmoke:
  node scripts/cutover-smoke.mjs <app> <base-url>
`;

async function main() {
  const parsed = parseAssetSmokeArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(HELP);
    return;
  }
  if (!parsed.canonicalOrigin || parsed.pages.length === 0) {
    console.error(HELP);
    process.exit(2);
  }
  const result = await smokeAssets(parsed);
  if (!result.ok) {
    console.error(reportAssetSmokeRejection(result));
    process.exit(1);
  }
  console.log(
    `asset smoke passed for ${parsed.pages.length} pages, ${result.assets.length} assets on ${parsed.canonicalOrigin}`
  );
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
