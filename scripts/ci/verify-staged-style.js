const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const { chmodSync, mkdirSync, mkdtempSync } = require('node:fs');
const {
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} = require('node:fs/promises');
const { createRequire } = require('node:module');
const { tmpdir } = require('node:os');
const { join, resolve, relative, sep } = require('node:path');
const { promisify } = require('node:util');
const { parseCurlOutput } = require('./verify-staged-critical-app');

const run = promisify(execFile);
// Every reason this script raises itself. Only these strings, never raw error
// text from child processes or the browser, may appear in logs or evidence.
const FAILURE_REASONS = [
  'Missing staged response headers',
  'Staged transport destination is not admitted',
  'Staged transport redirect is invalid or exceeds its bound',
  'Staged resource redirect changes its browser URL',
  'Staged stylesheet has the wrong content type',
  'Stylesheet is outside the built Next assets',
  'Stylesheet escapes the built artifact',
  'Staged CSS bytes differ from the built artifact',
  'An exact staged platform deployment and source identity are required',
  'Styled proof does not match the staged platform source',
  'Staged stylesheet request failed',
  'Staged public page failed or left the candidate',
  'Unverified stylesheet',
  'Candidate CSS did not verify against built bytes',
  'Candidate styles or fonts are missing',
  'Staged stylesheet rule inventory differs from built CSS',
  'Candidate utility styles are missing',
  'Staged image optimizer response is not an image',
  'Staged page evaluation failed',
  'Staged viewport screenshot failed',
];

// Only a bounded integer reaches evidence; anything else is recorded as null.
const scrubbedHeight = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 10_000_000 ? value : null;
// Phone and desktop shots stay viewport-sized. A 4000px clip of a 20k page
// is what Chromium rejected. At most one scrolled tile follows the top shot.
const STYLE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];
const SCREENSHOT_TIMEOUT_MS = 30_000;
// Classified failures stay `<ErrorName>:<class>`. An unclassified failure
// also keeps a scrubbed slice of the message: URLs and secret-shaped tokens
// are removed, and the slice is bounded.
const SCREENSHOT_ERROR_CLASSES = [
  ['timeout', /timeout|timed out/iu],
  ['target-closed', /closed|crashed|disconnected/iu],
  ['memory', /out of memory|\boom\b|allocation/iu],
  ['protocol', /protocol error/iu],
];
function scrubScreenshotDetail(message) {
  return String(message)
    .replace(/https?:\/\/\S+/giu, '[url]')
    .replace(/[A-Za-z0-9._%+-]*SECRET[A-Za-z0-9._%+-]*/gu, '[redacted]')
    .replace(/[^A-Za-z0-9:.,_() /+-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120);
}
function classifyScreenshotError(error) {
  const message = String(error?.message ?? '');
  const match = SCREENSHOT_ERROR_CLASSES.find(([, pattern]) =>
    pattern.test(message)
  );
  const name = /^[A-Za-z]{1,40}$/u.test(error?.name ?? '')
    ? error.name
    : 'Error';
  if (match) return `${name}:${match[0]}`;
  const detail = scrubScreenshotDetail(message);
  return detail ? `${name}:other:${detail}` : `${name}:other`;
}

// Default Next.js image optimization (`apps/web/next.config.ts` uses the
// built-in loader; `apps/web/src/proxy.ts` leaves `/_next/image` unmigrated).
const NEXT_IMAGE_PATH = '/_next/image';
const NEXT_IMAGE_QUERY_KEYS = Object.freeze(['url', 'w', 'q']);
// `/media/` is apps/web/public/media: the marketing navbar and footer render
// the local logo (`/media/logos/transparent.png`) through `next/image`.
const NEXT_IMAGE_INNER_PREFIXES = Object.freeze([
  '/_next/static/media/',
  '/images/',
  '/media/',
]);
// Resolved apps/web image optimizer sizing: next.config.ts sets remotePatterns
// only (createTuturuuuNextConfig merge in @tuturuuu/utils/next-config.ts does
// not override deviceSizes, imageSizes, or qualities). Unset fields use Next
// 16 imageConfigDefault (apps/web/package.json pins next ^16.4.0).
const WEB_PLATFORM_IMAGE_DEVICE_SIZES = Object.freeze([
  640, 750, 828, 1080, 1200, 1920, 2048, 3840,
]);
const WEB_PLATFORM_IMAGE_SIZES = Object.freeze([32, 48, 64, 96, 128, 256, 384]);
const WEB_PLATFORM_IMAGE_QUALITIES_ALLOWLIST = Object.freeze([75]);
const WEB_PLATFORM_IMAGE_WIDTHS_ALLOWLIST = new Set([
  ...WEB_PLATFORM_IMAGE_DEVICE_SIZES,
  ...WEB_PLATFORM_IMAGE_SIZES,
]);

function validateRelativeImageUrlParam(urlValue) {
  if (!urlValue || typeof urlValue !== 'string')
    throw new Error('Staged transport destination is not admitted');
  if (!urlValue.startsWith('/') || urlValue.startsWith('//'))
    throw new Error('Staged transport destination is not admitted');
  if (/^[a-z][a-z0-9+.-]*:/iu.test(urlValue))
    throw new Error('Staged transport destination is not admitted');
  if (urlValue.includes('\\'))
    throw new Error('Staged transport destination is not admitted');
  if (urlValue.includes('?') || urlValue.includes('#'))
    throw new Error('Staged transport destination is not admitted');
  if (/%2f/iu.test(urlValue))
    throw new Error('Staged transport destination is not admitted');
  if (/%/u.test(urlValue))
    throw new Error('Staged transport destination is not admitted');
  if (urlValue.includes('..'))
    throw new Error('Staged transport destination is not admitted');
  if (!NEXT_IMAGE_INNER_PREFIXES.some((prefix) => urlValue.startsWith(prefix)))
    throw new Error('Staged transport destination is not admitted');
  for (const segment of urlValue.split('/')) {
    if (segment === '.' || segment === '..')
      throw new Error('Staged transport destination is not admitted');
  }
}

function assertFrameworkImageResponse(target, resourceType, result) {
  if (
    target.pathname !== NEXT_IMAGE_PATH ||
    resourceType !== 'image' ||
    !target.search
  )
    return;
  const contentType = result.headers['content-type'] || '';
  if (!/^image\//iu.test(contentType))
    throw new Error('Staged image optimizer response is not an image');
}

function scrubTransportTarget(target, candidateOrigin) {
  const sameCandidateOrigin = target.origin === candidateOrigin;
  const hasSearch = Boolean(target.search);
  const hasHash = Boolean(target.hash);
  const hasCredentials = Boolean(target.username || target.password);
  let searchKeysOnlyDpl = false;
  let searchKeysFrameworkImage = false;
  if (hasSearch && sameCandidateOrigin) {
    const keys = [...new URLSearchParams(target.search).keys()].slice(0, 16);
    searchKeysOnlyDpl = keys.length === 1 && keys[0] === 'dpl';
    searchKeysFrameworkImage =
      keys.length === NEXT_IMAGE_QUERY_KEYS.length &&
      keys.every((key) => NEXT_IMAGE_QUERY_KEYS.includes(key)) &&
      new Set(keys).size === keys.length;
  }
  let pathname = sameCandidateOrigin ? '[redacted]' : '[foreign]';
  let classification = sameCandidateOrigin
    ? 'same-origin-other'
    : 'off-candidate';
  if (sameCandidateOrigin) {
    try {
      const decoded = decodeURIComponent(target.pathname).slice(0, 2048);
      if (decoded === NEXT_IMAGE_PATH && !/[\\\\%]/u.test(decoded)) {
        pathname = NEXT_IMAGE_PATH;
        classification = 'framework-image';
      } else if (
        decoded.startsWith('/_next/static/') &&
        decoded.endsWith('.css') &&
        !decoded.startsWith('//') &&
        !/[\\\\%]/u.test(decoded)
      ) {
        pathname = decoded;
        classification = 'built-stylesheet';
      }
    } catch {
      pathname = '[undecodable]';
      classification = 'undecodable-path';
    }
  }
  return {
    sameCandidateOrigin,
    origin: sameCandidateOrigin ? candidateOrigin : 'off-candidate',
    pathname,
    hasSearch,
    hasHash,
    hasCredentials,
    searchKeysOnlyDpl,
    searchKeysFrameworkImage,
    classification,
  };
}

function validateNextImageQuery(target) {
  if (target.pathname !== NEXT_IMAGE_PATH)
    throw new Error('Staged transport destination is not admitted');
  let pathname;
  try {
    pathname = decodeURIComponent(target.pathname);
  } catch {
    throw new Error('Staged transport destination is not admitted');
  }
  if (pathname !== NEXT_IMAGE_PATH)
    throw new Error('Staged transport destination is not admitted');
  const params = new URLSearchParams(target.search);
  const keys = [...params.keys()];
  if (
    keys.length !== NEXT_IMAGE_QUERY_KEYS.length ||
    new Set(keys).size !== keys.length
  )
    throw new Error('Staged transport destination is not admitted');
  for (const key of NEXT_IMAGE_QUERY_KEYS) {
    if (!params.has(key))
      throw new Error('Staged transport destination is not admitted');
  }
  validateRelativeImageUrlParam(params.get('url'));
  for (const name of ['w', 'q']) {
    const value = params.get(name);
    if (!/^[0-9]+$/.test(value))
      throw new Error('Staged transport destination is not admitted');
    const parsed = Number(value);
    if (!Number.isInteger(parsed))
      throw new Error('Staged transport destination is not admitted');
    if (name === 'w') {
      if (!WEB_PLATFORM_IMAGE_WIDTHS_ALLOWLIST.has(parsed))
        throw new Error('Staged transport destination is not admitted');
    } else if (!WEB_PLATFORM_IMAGE_QUALITIES_ALLOWLIST.includes(parsed))
      throw new Error('Staged transport destination is not admitted');
  }
}

function admitTransportTarget(
  target,
  candidateOrigin,
  { identity = false, resourceType = 'other' } = {}
) {
  let pathname;
  try {
    pathname = decodeURIComponent(target.pathname);
  } catch {
    throw transportError(
      'Staged transport destination is not admitted',
      target
    );
  }
  if (
    target.origin !== candidateOrigin ||
    target.username ||
    target.password ||
    target.hash ||
    pathname.startsWith('//') ||
    /[\\\\%]/u.test(pathname) ||
    (identity
      ? target.pathname !== '/api/build-info'
      : /^\/api(?:\/|$)/iu.test(pathname))
  )
    throw transportError(
      'Staged transport destination is not admitted',
      target
    );
  if (target.search) {
    if (identity || resourceType !== 'image')
      throw transportError(
        'Staged transport destination is not admitted',
        target
      );
    try {
      validateNextImageQuery(target);
    } catch {
      throw transportError(
        'Staged transport destination is not admitted',
        target
      );
    }
  }
}

function transportError(message, target) {
  const error = new Error(message);
  if (target instanceof URL) error.rejectedTarget = target;
  return error;
}

function describeFailure(error) {
  const message = String(error?.message ?? '');
  const known = FAILURE_REASONS.find((reason) => message.includes(reason));
  if (known) return known;
  const name = /^[A-Za-z]{1,40}$/u.test(error?.name ?? '')
    ? error.name
    : 'Error';
  const code =
    typeof error?.code === 'string' && /^[A-Z_]{1,30}$/u.test(error.code)
      ? `:${error.code}`
      : Number.isInteger(error?.code)
        ? `:exit-${error.code}`
        : '';
  return `Unclassified ${name}${code}`;
}
const safeEnvironment = (env) =>
  Object.fromEntries(
    [
      'PATH',
      'HOME',
      'LANG',
      'LC_ALL',
      'TMPDIR',
      'DISPLAY',
      'XDG_CACHE_HOME',
      'LD_LIBRARY_PATH',
    ]
      .filter((key) => env[key] !== undefined)
      .map((key) => [key, env[key]])
  );

function responseHeaders(source) {
  const blocks = source.trim().split(/\r?\n\r?\n/u);
  const block = blocks.findLast((value) => /^HTTP\/\S+ \d{3}/u.test(value));
  if (!block) throw new Error('Missing staged response headers');
  const headers = {};
  for (const line of block.split(/\r?\n/u).slice(1)) {
    const index = line.indexOf(':');
    if (index < 1) continue;
    const name = line.slice(0, index).toLowerCase();
    if (
      [
        'content-length',
        'content-encoding',
        'transfer-encoding',
        'connection',
        'set-cookie',
      ].includes(name)
    )
      continue;
    headers[name] = line.slice(index + 1).trim();
  }
  return headers;
}

async function verifyCss({ artifactRoot, pathname, body, contentType }) {
  if (!/^text\/css(?:;|$)/iu.test(contentType || ''))
    throw new Error('Staged stylesheet has the wrong content type');
  const decoded = decodeURIComponent(pathname);
  if (!decoded.startsWith('/_next/static/') || !decoded.endsWith('.css'))
    throw new Error('Stylesheet is outside the built Next assets');
  const root = await realpath(artifactRoot);
  const file = await realpath(resolve(root, `.${decoded}`));
  const path = relative(root, file);
  if (path === '..' || path.startsWith(`..${sep}`) || path.startsWith(sep))
    throw new Error('Stylesheet escapes the built artifact');
  const expected = await readFile(file);
  if (!expected.length || !expected.equals(body))
    throw new Error('Staged CSS bytes differ from the built artifact');
  return {
    path: pathname,
    expectedBytes: expected.length,
    bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

// RUNNER_TEMP is job-private in CI. Without it, a fixed path under tmpdir()
// can be planted as a symlink, so the local base is a fresh 0700 directory.
function proofDirectory({ runnerTemp, sha } = {}) {
  if (!/^[a-f0-9]{40}$/u.test(sha || ''))
    throw new Error(
      'An exact staged platform deployment and source identity are required'
    );
  if (runnerTemp) {
    const evidence = resolve(runnerTemp, 'staged-style-proof', sha);
    mkdirSync(evidence, { recursive: true, mode: 0o700 });
    chmodSync(evidence, 0o700);
    return evidence;
  }
  const base = mkdtempSync(join(tmpdir(), 'staged-style-proof-'));
  const evidence = join(base, sha);
  mkdirSync(evidence, { mode: 0o700 });
  chmodSync(evidence, 0o700);
  return evidence;
}

// Rename replaces the directory entry and does not follow a symlink there.
async function writeProof(directory, name, body) {
  const partial = join(
    directory,
    `.${name}.${randomBytes(8).toString('hex')}.part`
  );
  await writeFile(partial, body, { mode: 0o600, flag: 'wx' });
  await rename(partial, join(directory, name));
}

async function main({ env = process.env, runCommand = run, browserType } = {}) {
  const url = env.VERCEL_STAGED_DEPLOYMENT_URL;
  const sha = env.GITHUB_SHA;
  if (
    !/^https:\/\/[a-z0-9-]+\.vercel\.app\/?$/u.test(url || '') ||
    !/^[a-f0-9]{40}$/u.test(sha || '') ||
    !env.VERCEL_TOKEN ||
    env.VERCEL_STAGED_APP !== 'platform'
  )
    throw new Error(
      'An exact staged platform deployment and source identity are required'
    );
  const origin = new URL(url).origin;
  const root = process.cwd();
  const evidence = proofDirectory({ runnerTemp: env.RUNNER_TEMP, sha });
  const scratch = await mkdtemp(resolve(tmpdir(), 'staged-style-fetch-'));
  let sequence = 0;
  let browser;
  let stage = 'identity';
  let navigation;
  let viewport;
  // A step killed by its timeout never reaches the catch block, so the last
  // reached stage is kept on disk next to the rest of the proof.
  const markStage = async (next) => {
    stage = next;
    await writeProof(
      evidence,
      'stage.json',
      `${JSON.stringify({ stage, at: new Date().toISOString() })}\n`
    ).catch(() => {});
  };
  await markStage('identity');
  const failures = [];
  const blockedResources = [];
  const css = new Map();
  const cssSources = new Map();
  const cliEnv = {
    ...safeEnvironment(env),
    VERCEL_TOKEN: env.VERCEL_TOKEN,
    VERCEL_ORG_ID: env.VERCEL_ORG_ID,
    VERCEL_PROJECT_ID: env.VERCEL_PROJECT_ID,
  };
  function admit(target, identity = false, resourceType = 'other') {
    admitTransportTarget(target, origin, { identity, resourceType });
  }
  async function request(path, identity = false, resourceType = 'other') {
    let target = new URL(path, origin);
    const seen = new Set();
    for (let hop = 0; hop <= 5; hop += 1) {
      admit(target, identity, resourceType);
      if (seen.has(target.href))
        throw transportError(
          'Staged transport redirect is invalid or exceeds its bound',
          target
        );
      seen.add(target.href);
      const result = await requestHop(`${target.pathname}${target.search}`);
      if (result.status < 300 || result.status >= 400)
        return { ...result, finalUrl: target.href };
      if (
        identity ||
        hop === 5 ||
        ![301, 302, 303, 307, 308].includes(result.status) ||
        !result.headers.location
      )
        throw transportError(
          'Staged transport redirect is invalid or exceeds its bound',
          target
        );
      try {
        target = new URL(result.headers.location, target);
      } catch {
        throw transportError(
          'Staged transport redirect is invalid or exceeds its bound',
          target
        );
      }
    }
  }
  async function requestHop(path) {
    const id = sequence++;
    const headersFile = resolve(scratch, `${id}.headers`);
    const bodyFile = resolve(scratch, `${id}.body`);
    const { stdout } = await runCommand(
      'vercel',
      [
        'curl',
        path,
        '--deployment',
        url,
        '--',
        '--silent',
        '--show-error',
        '--compressed',
        '--max-time',
        '20',
        '--max-filesize',
        '16777216',
        '--dump-header',
        headersFile,
        '--output',
        bodyFile,
        '--write-out',
        '\nTTR_HTTP_STATUS:%{http_code}',
      ],
      { env: cliEnv, timeout: 45000, maxBuffer: 128 * 1024 }
    );
    return {
      status: parseCurlOutput(stdout).status,
      headers: responseHeaders(await readFile(headersFile, 'utf8')),
      body: await readFile(bodyFile),
    };
  }
  try {
    const stamp = await request('/api/build-info', true);
    const identity = JSON.parse(stamp.body.toString());
    if (
      stamp.status !== 200 ||
      identity.commitHash !== sha ||
      identity.appName !== 'web' ||
      identity.environment !== 'production'
    )
      throw new Error('Styled proof does not match the staged platform source');
    const chromium =
      browserType ||
      createRequire(resolve(root, 'apps/web/package.json'))('playwright')
        .chromium;
    await markStage('browser');
    browser = await chromium.launch({
      headless: true,
      env: safeEnvironment(env),
    });
    const context = await browser.newContext({
      colorScheme: 'light',
      serviceWorkers: 'block',
    });
    let documentResponse;
    await context.route('**/*', async (route) => {
      try {
        const target = new URL(route.request().url());
        const resourceType = route.request().resourceType();
        if (route.request().method() !== 'GET')
          return route.abort('blockedbyclient');
        admit(target, false, resourceType);
        const cached =
          resourceType === 'document' &&
          documentResponse?.finalUrl === target.href
            ? documentResponse
            : undefined;
        if (cached) documentResponse = undefined;
        const { finalUrl, ...result } =
          cached || (await request(target.href, false, resourceType));
        // Only pre-resolved navigation can change URL: flattening redirects at
        // another URL would give HTML and CSS the wrong relative-resource base.
        if (finalUrl !== target.href)
          throw transportError(
            'Staged resource redirect changes its browser URL',
            new URL(finalUrl)
          );
        if (route.request().resourceType() === 'stylesheet') {
          if (result.status !== 200)
            throw new Error('Staged stylesheet request failed');
          const record = await verifyCss({
            artifactRoot: resolve(root, '.vercel/output/static'),
            pathname: target.pathname,
            body: result.body,
            contentType: result.headers['content-type'],
          });
          css.set(target.pathname, record);
          cssSources.set(target.pathname, result.body.toString('utf8'));
        }
        assertFrameworkImageResponse(target, resourceType, result);
        await route.fulfill(result);
      } catch (error) {
        const reason = describeFailure(error);
        failures.push(reason);
        const rejected =
          error?.rejectedTarget instanceof URL
            ? error.rejectedTarget
            : new URL(route.request().url());
        blockedResources.push({
          resourceType: route.request().resourceType(),
          reason,
          ...scrubTransportTarget(rejected, origin),
        });
        await route.abort('failed');
      }
    });
    const viewports = [];
    for (const { width, height } of STYLE_VIEWPORTS) {
      await markStage(`viewport-${width}`);
      navigation = undefined;
      viewport = { width, scrollHeight: null };
      let page = await context.newPage();
      await page.setViewportSize({ width, height });
      documentResponse = await request('/en');
      const pageUrl = documentResponse.finalUrl;
      const response = await page.goto(pageUrl, {
        waitUntil: 'load',
        timeout: 60000,
      });
      const finalUrl = URL.parse(page.url());
      const status = response ? response.status() : null;
      navigation = {
        responsePresent: Boolean(response),
        status:
          Number.isInteger(status) && status >= 100 && status <= 599
            ? status
            : null,
        finalOrigin: finalUrl?.origin.slice(0, 512) ?? null,
        finalPath: finalUrl?.pathname.slice(0, 2048) ?? null,
        http200: status === 200,
        sameCandidateOrigin: finalUrl?.origin === origin,
      };
      if (
        !response ||
        response.status() !== 200 ||
        new URL(page.url()).origin !== origin
      )
        throw new Error('Staged public page failed or left the candidate');
      let metrics;
      try {
        metrics = await page.evaluate(async (expected) => {
          await document.fonts.ready;
          const sheets = [...document.styleSheets];
          const rules = (list) =>
            [...list].reduce(
              (n, rule) => n + 1 + (rule.cssRules ? rules(rule.cssRules) : 0),
              0
            );
          const ruleCount = sheets.reduce(
            (n, sheet) => n + rules(sheet.cssRules),
            0
          );
          const compared = sheets
            .filter((sheet) => sheet.href)
            .map((sheet) => {
              const path = new URL(sheet.href).pathname;
              if (!Object.hasOwn(expected, path))
                throw new Error('Unverified stylesheet');
              const built = new CSSStyleSheet();
              built.replaceSync(expected[path]);
              return {
                path,
                expectedRules: rules(built.cssRules),
                servedRules: rules(sheet.cssRules),
              };
            });
          const probe = document.createElement('div');
          probe.className = 'flex gap-4 rounded-lg p-4';
          probe.style.visibility = 'hidden';
          document.body.append(probe);
          const style = getComputedStyle(probe);
          const utility = {
            display: style.display,
            gap: parseFloat(style.gap),
            padding: parseFloat(style.paddingTop),
            radius: parseFloat(style.borderTopLeftRadius),
          };
          probe.remove();
          return {
            ruleCount,
            compared,
            utility,
            fontFailures: [...document.fonts].filter(
              (font) => font.status === 'error'
            ).length,
            scrollHeight: document.documentElement.scrollHeight,
          };
        }, Object.fromEntries(cssSources));
      } catch (error) {
        // An in-page check that already names its reason keeps it.
        const message = String(error?.message ?? '');
        if (FAILURE_REASONS.some((reason) => message.includes(reason)))
          throw error;
        throw new Error('Staged page evaluation failed');
      }
      const { scrollHeight, ...pageMetrics } = metrics;
      viewport.scrollHeight = scrubbedHeight(scrollHeight);
      assert.ok(
        !failures.length,
        failures.find((value) => FAILURE_REASONS.includes(value)) ||
          'Staged stylesheet request failed'
      );
      assert.ok(css.size > 0, 'Unverified stylesheet');
      assert.ok(
        metrics.ruleCount > 0 && metrics.fontFailures === 0,
        'Candidate styles or fonts are missing'
      );
      assert.ok(
        metrics.compared.length > 0 &&
          metrics.compared.every(
            (sheet) =>
              sheet.expectedRules > 0 &&
              sheet.expectedRules === sheet.servedRules
          ),
        'Staged stylesheet rule inventory differs from built CSS'
      );
      assert.ok(
        metrics.utility.display === 'flex' &&
          metrics.utility.gap > 0 &&
          metrics.utility.padding > 0 &&
          metrics.utility.radius > 0,
        'Candidate utility styles are missing'
      );
      const tiled =
        viewport.scrollHeight !== null && viewport.scrollHeight > height;
      // Top of the viewport, plus at most one scrolled tile. Never a tall clip.
      const shots = [
        { name: `platform-${width}.png`, y: 0 },
        ...(tiled ? [{ name: `platform-${width}-tile.png`, y: height }] : []),
      ];
      Object.assign(viewport, {
        captureMode: tiled ? 'viewport-plus-tile' : 'viewport',
        tileCount: shots.length,
        clipHeight: height,
        screenshotErrors: [],
      });
      let saved = 0;
      for (const shot of shots) {
        let took = false;
        for (let attempt = 0; attempt < 2 && !took; attempt += 1) {
          if (attempt === 1) {
            await page.close().catch(() => {});
            page = await context.newPage();
            await page.setViewportSize({ width, height });
            const retry = await page.goto(pageUrl, {
              waitUntil: 'load',
              timeout: 60000,
            });
            if (
              !retry ||
              retry.status() !== 200 ||
              new URL(page.url()).origin !== origin
            ) {
              viewport.screenshotErrors.push(
                'Error:other:fresh page was not the candidate'
              );
              break;
            }
          }
          const partial = join(
            evidence,
            `.${shot.name}.${randomBytes(8).toString('hex')}.part`
          );
          try {
            if (shot.y > 0)
              await page.evaluate((y) => window.scrollTo(0, y), shot.y);
            await page.screenshot({
              path: partial,
              animations: 'disabled',
              timeout: SCREENSHOT_TIMEOUT_MS,
            });
            await rename(partial, join(evidence, shot.name));
            took = true;
            saved += 1;
          } catch (error) {
            viewport.screenshotErrors.push(classifyScreenshotError(error));
            await rm(partial, { force: true }).catch(() => {});
          }
        }
        if (!took) break;
      }
      if (saved !== shots.length) {
        console.error(
          `Staged viewport screenshot advisory at ${width}px: ${viewport.screenshotErrors.join(', ') || 'Error:other'}. Style checks passed. Promotion is not blocked.`
        );
      }
      viewports.push({
        width,
        height,
        path: '/en',
        screenshot: saved === shots.length ? 'PASS' : 'FAILED_ADVISORY',
        ...(saved > 0 ? { image: shots[0].name } : {}),
        scrollHeight: viewport.scrollHeight,
        captureMode: viewport.captureMode,
        tileCount: viewport.tileCount,
        clipHeight: viewport.clipHeight,
        screenshotErrors: viewport.screenshotErrors,
        ...pageMetrics,
      });
      await page.close();
    }
    await markStage('receipt');
    const receipt = {
      source: sha,
      deployment: url,
      app: 'platform',
      stage: 'before-promotion',
      css: [...css.values()],
      viewports,
      limits:
        'Anonymous public shell styles only; no authenticated feature or post-promotion acceptance.',
    };
    await writeProof(
      evidence,
      'receipt.json',
      `${JSON.stringify(receipt, null, 2)}\n`
    );
    console.log(
      viewports.some((view) => view.screenshot === 'FAILED_ADVISORY')
        ? 'Verified staged CSS bytes and utility rendering. Screenshot capture is advisory and did not block promotion.'
        : 'Verified staged CSS bytes, utility rendering and 390/1440 screenshots.'
    );
    return receipt;
  } catch (error) {
    const reason = describeFailure(error);
    await writeProof(
      evidence,
      'failure.json',
      `${JSON.stringify(
        {
          source: sha,
          deployment: url,
          stage,
          reason,
          verifiedStylesheetCount: css.size,
          resourceFailures: [...new Set(failures)].slice(0, 10),
          blockedResources: blockedResources.slice(0, 10),
          ...(navigation ? { navigation } : {}),
          ...(viewport ? { viewport } : {}),
        },
        null,
        2
      )}\n`
    ).catch(() => {});
    error.stagedReason = reason;
    throw error;
  } finally {
    if (browser) await browser.close();
    await rm(scratch, { recursive: true, force: true });
  }
}

module.exports = {
  FAILURE_REASONS,
  describeFailure,
  main,
  proofDirectory,
  responseHeaders,
  safeEnvironment,
  admitTransportTarget,
  scrubTransportTarget,
  validateNextImageQuery,
  validateRelativeImageUrlParam,
  WEB_PLATFORM_IMAGE_QUALITIES_ALLOWLIST,
  WEB_PLATFORM_IMAGE_WIDTHS_ALLOWLIST,
  verifyCss,
  writeProof,
};
if (require.main === module)
  main().catch((error) => {
    console.error(
      `Staged style proof failed: ${error?.stagedReason ?? describeFailure(error)}. Promotion is blocked.`
    );
    process.exitCode = 1;
  });
