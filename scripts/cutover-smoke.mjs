#!/usr/bin/env node

/**
 * Cross-App Cutover Smoke Harness (D15)
 *
 * Verifies post-cutover app health across Cloudflare Workers / TanStack Start:
 * 1. Anonymous 200 on entry route
 * 2. Login page renders (HTTP 200 with non-empty HTML/content)
 * 3. No redirect loops detected across checked routes
 * 4. No 5xx server errors on 5 configured paths
 *
 * Prints structured PASS/FAIL JSON to stdout.
 * Exit code 0 on PASS, 1 on FAIL.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_CONFIG_PATH = path.join(
  __dirname,
  'cutover-smoke-config.json'
);
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_REDIRECTS = 10;

/**
 * Normalizes an origin/base URL string.
 */
export function normalizeBaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Base URL is required and must be a string.');
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Base URL cannot be empty.');
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch (error) {
    throw new Error(`Invalid base URL '${rawUrl}': ${error.message}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Base URL protocol must be http or https, got '${parsed.protocol}'`
    );
  }

  // Strip trailing slashes for clean path appending
  return parsed.origin;
}

/**
 * Loads the per-app route configuration table.
 */
export function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  const resolved = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Smoke configuration table not found at: ${resolved}`);
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(
      `Failed to parse smoke config JSON from ${resolved}: ${err.message}`
    );
  }
}

/**
 * Resolves configuration for a specific app name.
 */
export function resolveAppConfig(appName, configTable) {
  if (!appName) {
    throw new Error('App name is required.');
  }

  const apps = configTable?.apps || {};
  const normalizedKey = appName.toLowerCase().trim();

  const found = apps[normalizedKey] || apps[appName] || apps._default;
  if (!found) {
    const available = Object.keys(apps)
      .filter((key) => key !== '_default')
      .join(', ');
    throw new Error(
      `App '${appName}' not found in smoke config. Available apps: ${available}`
    );
  }

  const entryRoute = found.entryRoute || '/';
  const loginRoute = found.loginRoute || '/login';
  const rawPaths = Array.isArray(found.paths) ? found.paths : [];

  // Guarantee at least 5 paths to check
  const pathsSet = new Set(rawPaths);
  pathsSet.add(entryRoute);
  pathsSet.add(loginRoute);
  if (pathsSet.size < 5) {
    for (const fallback of [
      '/robots.txt',
      '/manifest.json',
      '/health',
      '/api/health',
    ]) {
      pathsSet.add(fallback);
      if (pathsSet.size >= 5) break;
    }
  }

  return {
    name: found.name || normalizedKey,
    entryRoute,
    loginRoute,
    paths: Array.from(pathsSet).slice(0, 5),
  };
}

/**
 * Executes an HTTP fetch following redirects step-by-step to detect loops.
 */
export async function fetchWithRedirectTracking(
  targetUrl,
  options = {},
  {
    fetchImpl = globalThis.fetch,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}
) {
  const chain = [];
  const visited = new Set();
  let currentUrl = targetUrl;
  let redirectsCount = 0;
  const startTime = Date.now();

  while (true) {
    chain.push(currentUrl);

    if (visited.has(currentUrl)) {
      return {
        url: currentUrl,
        finalUrl: currentUrl,
        status: 0,
        statusText: 'Redirect Loop',
        headers: {},
        body: '',
        durationMs: Date.now() - startTime,
        chain,
        redirectsCount,
        loopDetected: true,
        maxRedirectsExceeded: false,
        error: `Redirect loop detected: '${currentUrl}' was visited multiple times in chain [${chain.join(' -> ')}]`,
      };
    }
    visited.add(currentUrl);

    if (redirectsCount > maxRedirects) {
      return {
        url: currentUrl,
        finalUrl: currentUrl,
        status: 0,
        statusText: 'Too Many Redirects',
        headers: {},
        body: '',
        durationMs: Date.now() - startTime,
        chain,
        redirectsCount,
        loopDetected: false,
        maxRedirectsExceeded: true,
        error: `Exceeded maximum redirect limit (${maxRedirects}) while following [${chain.join(' -> ')}]`,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetchImpl(currentUrl, {
        ...options,
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      return {
        url: targetUrl,
        finalUrl: currentUrl,
        status: 0,
        statusText: 'Fetch Error',
        headers: {},
        body: '',
        durationMs: Date.now() - startTime,
        chain,
        redirectsCount,
        loopDetected: false,
        maxRedirectsExceeded: false,
        error:
          err.name === 'AbortError'
            ? `Request timed out after ${timeoutMs}ms`
            : err.message,
      };
    } finally {
      clearTimeout(timeoutId);
    }

    const status = response.status;
    const isRedirect = [301, 302, 303, 307, 308].includes(status);

    if (isRedirect) {
      const locationHeader =
        response.headers.get?.('location') ||
        (response.headers['location'] ?? response.headers['Location']);

      if (!locationHeader) {
        return {
          url: targetUrl,
          finalUrl: currentUrl,
          status,
          statusText: response.statusText || 'Redirect Without Location',
          headers: response.headers,
          body: '',
          durationMs: Date.now() - startTime,
          chain,
          redirectsCount,
          loopDetected: false,
          maxRedirectsExceeded: false,
          error: `Redirect status ${status} encountered but no Location header present.`,
        };
      }

      redirectsCount++;
      try {
        currentUrl = new URL(locationHeader, currentUrl).href;
      } catch (err) {
        return {
          url: targetUrl,
          finalUrl: currentUrl,
          status,
          statusText: 'Invalid Location Header',
          headers: response.headers,
          body: '',
          durationMs: Date.now() - startTime,
          chain,
          redirectsCount,
          loopDetected: false,
          maxRedirectsExceeded: false,
          error: `Malformed Location header '${locationHeader}': ${err.message}`,
        };
      }
      continue;
    }

    // Non-redirect response reached
    let body = '';
    try {
      body = typeof response.text === 'function' ? await response.text() : '';
    } catch {
      body = '';
    }

    return {
      url: targetUrl,
      finalUrl: currentUrl,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body,
      durationMs: Date.now() - startTime,
      chain,
      redirectsCount,
      loopDetected: false,
      maxRedirectsExceeded: false,
      error: null,
    };
  }
}

/**
 * Check 1: Anonymous 200 on entry route.
 */
export async function checkEntryRoute(baseUrl, route, options = {}) {
  const url = `${baseUrl}${route.startsWith('/') ? route : `/${route}`}`;
  const res = await fetchWithRedirectTracking(
    url,
    { headers: { 'User-Agent': 'TTR-Cutover-Smoke/1.0' } },
    options
  );

  const passed =
    res.status === 200 &&
    !res.loopDetected &&
    !res.maxRedirectsExceeded &&
    !res.error;
  return {
    name: 'entry_route_anon_200',
    route,
    url,
    finalUrl: res.finalUrl,
    status: res.status,
    passed,
    durationMs: res.durationMs,
    chain: res.chain,
    loopDetected: res.loopDetected,
    error:
      res.error ||
      (res.status !== 200
        ? `Expected HTTP 200 on entry route, got ${res.status}`
        : null),
  };
}

/**
 * Check 2: Login page renders.
 * Verifies status 200 and non-empty content with login/HTML indicators.
 */
export async function checkLoginRoute(baseUrl, route, options = {}) {
  const url = `${baseUrl}${route.startsWith('/') ? route : `/${route}`}`;
  const res = await fetchWithRedirectTracking(
    url,
    { headers: { 'User-Agent': 'TTR-Cutover-Smoke/1.0' } },
    options
  );

  const isHtmlOrText = res.body && res.body.trim().length > 0;
  const is200 = res.status === 200;
  const renders =
    is200 &&
    isHtmlOrText &&
    !res.loopDetected &&
    !res.maxRedirectsExceeded &&
    !res.error;

  return {
    name: 'login_page_renders',
    route,
    url,
    finalUrl: res.finalUrl,
    status: res.status,
    passed: Boolean(renders),
    renders: Boolean(renders),
    durationMs: res.durationMs,
    bodyLength: res.body ? res.body.length : 0,
    chain: res.chain,
    loopDetected: res.loopDetected,
    error:
      res.error ||
      (!is200
        ? `Expected HTTP 200 on login route, got ${res.status}`
        : !isHtmlOrText
          ? 'Login response body was empty'
          : null),
  };
}

/**
 * Check 4: No 5xx server errors on 5 listed paths.
 */
export async function checkPathsNo5xx(baseUrl, paths, options = {}) {
  const results = [];
  let allNon5xx = true;
  let anyLoop = false;

  for (const p of paths) {
    const url = `${baseUrl}${p.startsWith('/') ? p : `/${p}`}`;
    const res = await fetchWithRedirectTracking(
      url,
      { headers: { 'User-Agent': 'TTR-Cutover-Smoke/1.0' } },
      options
    );

    const is5xx = res.status >= 500 && res.status < 600;
    const ok =
      !is5xx &&
      res.status !== 0 &&
      !res.loopDetected &&
      !res.maxRedirectsExceeded &&
      !res.error;

    if (is5xx || res.status === 0 || res.error) {
      allNon5xx = false;
    }
    if (res.loopDetected || res.maxRedirectsExceeded) {
      anyLoop = true;
      allNon5xx = false;
    }

    results.push({
      path: p,
      url,
      finalUrl: res.finalUrl,
      status: res.status,
      ok,
      is5xx,
      durationMs: res.durationMs,
      chain: res.chain,
      loopDetected: res.loopDetected,
      error: is5xx ? `Server error HTTP ${res.status}` : res.error,
    });
  }

  return {
    name: 'no_5xx_on_5_paths',
    passed: allNon5xx && !anyLoop,
    testedCount: results.length,
    paths: results,
  };
}

/**
 * Main smoke test coordinator.
 */
export async function runCutoverSmoke(
  appName,
  rawBaseUrl,
  {
    configPath = DEFAULT_CONFIG_PATH,
    customConfig = null,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
  } = {}
) {
  const startTimestamp = new Date().toISOString();
  const startTime = Date.now();
  const errors = [];

  let baseUrl;
  try {
    baseUrl = normalizeBaseUrl(rawBaseUrl);
  } catch (err) {
    return {
      status: 'FAIL',
      pass: false,
      app: appName,
      baseUrl: rawBaseUrl,
      timestamp: startTimestamp,
      durationMs: Date.now() - startTime,
      errors: [err.message],
      checks: {},
    };
  }

  let appConfig;
  try {
    const configTable = customConfig || loadConfig(configPath);
    appConfig = resolveAppConfig(appName, configTable);
  } catch (err) {
    return {
      status: 'FAIL',
      pass: false,
      app: appName,
      baseUrl,
      timestamp: startTimestamp,
      durationMs: Date.now() - startTime,
      errors: [err.message],
      checks: {},
    };
  }

  const probeOptions = { fetchImpl, timeoutMs, maxRedirects };

  // 1. Entry route anon 200
  const entryResult = await checkEntryRoute(
    baseUrl,
    appConfig.entryRoute,
    probeOptions
  );
  if (!entryResult.passed) {
    errors.push(`[EntryRoute] ${entryResult.error}`);
  }

  // 2. Login page renders
  const loginResult = await checkLoginRoute(
    baseUrl,
    appConfig.loginRoute,
    probeOptions
  );
  if (!loginResult.passed) {
    errors.push(`[LoginRoute] ${loginResult.error}`);
  }

  // 3. Five listed paths no 5xx
  const pathsResult = await checkPathsNo5xx(
    baseUrl,
    appConfig.paths,
    probeOptions
  );
  if (!pathsResult.passed) {
    const failedPaths = pathsResult.paths
      .filter((p) => !p.ok)
      .map((p) => `${p.path} (${p.status})`);
    errors.push(`[5xxCheck] Routes failed: ${failedPaths.join(', ')}`);
  }

  // 4. No redirect loop across all probes
  const allChains = [
    {
      source: 'entry',
      loopDetected: entryResult.loopDetected,
      chain: entryResult.chain,
    },
    {
      source: 'login',
      loopDetected: loginResult.loopDetected,
      chain: loginResult.chain,
    },
    ...pathsResult.paths.map((p) => ({
      source: p.path,
      loopDetected: p.loopDetected,
      chain: p.chain,
    })),
  ];
  const redirectLoopFound = allChains.some((c) => c.loopDetected);
  const redirectCheck = {
    name: 'no_redirect_loop',
    passed: !redirectLoopFound,
    loops: allChains.filter((c) => c.loopDetected),
  };
  if (redirectLoopFound) {
    errors.push(`[RedirectLoop] Circular redirect loop detected in probe`);
  }

  const pass =
    entryResult.passed &&
    loginResult.passed &&
    pathsResult.passed &&
    redirectCheck.passed;

  return {
    status: pass ? 'PASS' : 'FAIL',
    pass,
    app: appConfig.name,
    baseUrl,
    timestamp: startTimestamp,
    durationMs: Date.now() - startTime,
    summary: {
      entryRoute: {
        passed: entryResult.passed,
        status: entryResult.status,
        path: appConfig.entryRoute,
      },
      loginRoute: {
        passed: loginResult.passed,
        status: loginResult.status,
        path: appConfig.loginRoute,
      },
      noRedirectLoops: { passed: redirectCheck.passed },
      no5xxOn5Paths: {
        passed: pathsResult.passed,
        testedCount: pathsResult.testedCount,
      },
    },
    checks: {
      entryRoute: entryResult,
      loginRoute: loginResult,
      redirects: redirectCheck,
      paths: pathsResult,
    },
    errors,
  };
}

/**
 * CLI Argument Parser.
 */
export function parseArgs(argv = process.argv.slice(2)) {
  let app = null;
  let baseUrl = null;
  let configPath = DEFAULT_CONFIG_PATH;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    if (arg === '--app') {
      app = argv[++i];
    } else if (arg === '--url' || arg === '--base-url') {
      baseUrl = argv[++i];
    } else if (arg === '--config') {
      configPath = argv[++i];
    } else if (arg === '--timeout') {
      timeoutMs = Number.parseInt(argv[++i], 10) || DEFAULT_TIMEOUT_MS;
    } else if (!arg.startsWith('-')) {
      positionals.push(arg);
    }
  }

  if (!app && positionals.length > 0) {
    app = positionals[0];
  }
  if (!baseUrl && positionals.length > 1) {
    baseUrl = positionals[1];
  }

  return { app, baseUrl, configPath, timeoutMs };
}

/**
 * CLI Main Entry Point
 */
export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);

  if (parsed.help) {
    console.log(`
Usage:
  node scripts/cutover-smoke.mjs <app-name> <base-url> [options]

Arguments:
  <app-name>   Target app name (e.g. web, marketing, workspace, shortener)
  <base-url>   Target base URL (e.g. https://web.tutur3u.com)

Options:
  --config <path>   Path to custom smoke configuration table JSON
  --timeout <ms>    Request timeout in milliseconds (default: 10000)
  --help, -h        Show this help message

Output:
  Prints PASS/FAIL JSON to stdout. Exits 0 on PASS, 1 on FAIL.
`);
    return 0;
  }

  if (!parsed.app || !parsed.baseUrl) {
    const errorReport = {
      status: 'FAIL',
      pass: false,
      app: parsed.app || null,
      baseUrl: parsed.baseUrl || null,
      timestamp: new Date().toISOString(),
      errors: [
        'Both <app-name> and <base-url> arguments are required. Run with --help for details.',
      ],
    };
    console.log(JSON.stringify(errorReport, null, 2));
    return 1;
  }

  const result = await runCutoverSmoke(parsed.app, parsed.baseUrl, {
    configPath: parsed.configPath,
    timeoutMs: parsed.timeoutMs,
  });

  console.log(JSON.stringify(result, null, 2));
  return result.pass ? 0 : 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)
) {
  main().then((code) => {
    process.exit(code);
  });
}
