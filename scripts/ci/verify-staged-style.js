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
];

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
  const css = new Map();
  const cssSources = new Map();
  const cliEnv = {
    ...safeEnvironment(env),
    VERCEL_TOKEN: env.VERCEL_TOKEN,
    VERCEL_ORG_ID: env.VERCEL_ORG_ID,
    VERCEL_PROJECT_ID: env.VERCEL_PROJECT_ID,
  };
  function admit(target, identity = false) {
    let pathname;
    try {
      pathname = decodeURIComponent(target.pathname);
    } catch {
      throw new Error('Staged transport destination is not admitted');
    }
    if (
      target.origin !== origin ||
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      pathname.startsWith('//') ||
      /[\\\\%]/u.test(pathname) ||
      (identity
        ? target.pathname !== '/api/build-info'
        : /^\/api(?:\/|$)/iu.test(pathname))
    )
      throw new Error('Staged transport destination is not admitted');
  }
  async function request(path, identity = false) {
    let target = new URL(path, origin);
    const seen = new Set();
    for (let hop = 0; hop <= 5; hop += 1) {
      admit(target, identity);
      if (seen.has(target.href))
        throw new Error(
          'Staged transport redirect is invalid or exceeds its bound'
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
        throw new Error(
          'Staged transport redirect is invalid or exceeds its bound'
        );
      try {
        target = new URL(result.headers.location, target);
      } catch {
        throw new Error(
          'Staged transport redirect is invalid or exceeds its bound'
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
        if (route.request().method() !== 'GET')
          return route.abort('blockedbyclient');
        admit(target);
        const cached =
          route.request().resourceType() === 'document' &&
          documentResponse?.finalUrl === target.href
            ? documentResponse
            : undefined;
        if (cached) documentResponse = undefined;
        const { finalUrl, ...result } = cached || (await request(target.href));
        // Only pre-resolved navigation can change URL: flattening redirects at
        // another URL would give HTML and CSS the wrong relative-resource base.
        if (finalUrl !== target.href)
          throw new Error('Staged resource redirect changes its browser URL');
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
        await route.fulfill(result);
      } catch (error) {
        failures.push(describeFailure(error));
        await route.abort('failed');
      }
    });
    const viewports = [];
    for (const width of [390, 1440]) {
      await markStage(`viewport-${width}`);
      navigation = undefined;
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 900 });
      documentResponse = await request('/en');
      const response = await page.goto(documentResponse.finalUrl, {
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
      const metrics = await page.evaluate(async (expected) => {
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
        };
      }, Object.fromEntries(cssSources));
      assert.ok(
        !failures.length && css.size > 0,
        'Candidate CSS did not verify against built bytes'
      );
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
      const screenshot = `platform-${width}.png`;
      const partial = join(
        evidence,
        `.${screenshot}.${randomBytes(8).toString('hex')}.part`
      );
      await page.screenshot({
        path: partial,
        fullPage: true,
        animations: 'disabled',
      });
      await rename(partial, join(evidence, screenshot));
      viewports.push({
        width,
        height: 900,
        path: '/en',
        screenshot,
        ...metrics,
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
      'Verified staged CSS bytes, utility rendering and 390/1440 screenshots.'
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
          resourceFailures: [...new Set(failures)].slice(0, 10),
          ...(navigation ? { navigation } : {}),
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
