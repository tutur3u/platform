// Post-deploy smoke for a satellite cut over to its native Worker on its own
// subdomain (root mode). Pure: `runSmoke` takes an injected fetch, so the same
// checks run against production, staging or a local workerd, and in tests.

const CRAWLER_UA = 'facebookexternalhit/1.1';
/** A browser-like default; the wildcard case has its own check. */
const ACCEPT_LANGUAGE = 'en-US,en;q=0.9';

/**
 * @param {{
 *   origin: string,
 *   app: string,
 *   expectRuntime: 'native' | 'legacy',
 *   centralLogin?: string,
 *   protectedPage?: string,
 *   protectedApi?: string,
 *   crawlerPage?: string,
 * }} options
 */
export function smokePlan(options) {
  const native = options.expectRuntime === 'native';
  const central = options.centralLogin ?? 'https://tuturuuu.com/login';
  const verifyPrefix = `${options.origin}/verify-token`;
  const protectedPage = options.protectedPage ?? '/vi/personal/boards';
  return [
    { name: 'robots', path: '/robots.txt', expect: { status: [200] } },
    {
      name: 'anonymous root goes to the central login',
      path: '/',
      expect: { status: [307], loginReturn: { central, verifyPrefix } },
    },
    {
      name: 'anonymous protected page keeps its path through login',
      path: protectedPage,
      expect: {
        status: [307],
        loginReturn: { central, verifyPrefix, nextUrl: protectedPage },
      },
    },
    {
      name: 'protected API without a session',
      path: options.protectedApi ?? '/api/v1/workspaces/personal/task-boards',
      expect: { status: [401] },
    },
    {
      name: 'build-info',
      path: '/api/build-info',
      // Native answers release identity publicly; the Next proxy guards it.
      expect: native
        ? { status: [200], json: { appName: options.app } }
        : { status: [401] },
    },
    ...(native
      ? [
          {
            name: 'server-function guard rejects non-JSON POST',
            path: '/_serverFn/smoke',
            method: 'POST',
            body: 'x',
            headers: { 'content-type': 'text/plain' },
            expect: { status: [415] },
          },
        ]
      : []),
    {
      name: 'crawler preview renders',
      path: options.crawlerPage ?? '/shared/task/smoke',
      headers: { 'user-agent': CRAWLER_UA },
      expect: { status: [200], html: true, assets: true },
    },
    {
      // Clients such as Node fetch send `*`; locale negotiation must not 500.
      name: 'wildcard Accept-Language does not fail',
      path: options.crawlerPage ?? '/shared/task/smoke',
      headers: { 'user-agent': CRAWLER_UA, 'accept-language': '*' },
      expect: { status: [200], html: true },
    },
  ];
}

function checkLoginReturn(location, { central, verifyPrefix, nextUrl }) {
  if (!location) return 'missing Location';
  const url = new URL(location);
  if (`${url.origin}${url.pathname}` !== central)
    return `Location ${url.origin}${url.pathname} is not ${central}`;
  const returnUrl = url.searchParams.get('returnUrl') ?? '';
  if (!returnUrl.startsWith(verifyPrefix))
    return `returnUrl ${returnUrl} does not start with ${verifyPrefix}`;
  if (nextUrl) {
    const next = new URL(returnUrl).searchParams.get('nextUrl');
    if (next !== nextUrl) return `nextUrl ${next} is not ${nextUrl}`;
  }
  return null;
}

/** Runs the plan; returns per-check results and whether everything passed. */
export async function runSmoke(options, fetchImpl = fetch) {
  const native = options.expectRuntime === 'native';
  const results = [];
  for (const check of smokePlan(options)) {
    const started = performance.now();
    const failures = [];
    let response;
    try {
      response = await fetchImpl(`${options.origin}${check.path}`, {
        method: check.method ?? 'GET',
        headers: { 'accept-language': ACCEPT_LANGUAGE, ...check.headers },
        body: check.body,
        redirect: 'manual',
      });
    } catch (error) {
      results.push({ name: check.name, ok: false, failures: [String(error)] });
      continue;
    }
    const ttfbMs = Math.round(performance.now() - started);
    const { status, headers } = response;
    if (!check.expect.status.includes(status))
      failures.push(`status ${status}, expected ${check.expect.status}`);
    if (status >= 500) failures.push(`server error ${status}`);
    const runtime = headers.get('x-tuturuuu-runtime');
    if (native && runtime !== 'native')
      failures.push(`x-tuturuuu-runtime ${runtime}, expected native`);
    if (!native && runtime === 'native')
      failures.push('served by the native Worker, expected legacy');
    if (headers.get('x-frame-options') !== 'DENY')
      failures.push('missing X-Frame-Options: DENY');
    if (
      !/frame-ancestors 'none'/u.test(
        headers.get('content-security-policy') ?? ''
      )
    )
      failures.push("missing CSP frame-ancestors 'none'");
    if (check.expect.loginReturn) {
      const problem = checkLoginReturn(
        headers.get('location'),
        check.expect.loginReturn
      );
      if (problem) failures.push(problem);
    }
    const body = await response.text();
    if (check.expect.json) {
      try {
        const json = JSON.parse(body);
        for (const [key, value] of Object.entries(check.expect.json))
          if (json[key] !== value)
            failures.push(`${key} ${json[key]}, expected ${value}`);
      } catch {
        failures.push('body is not JSON');
      }
    }
    if (check.expect.html && !/^<!DOCTYPE html>/iu.test(body.trimStart()))
      failures.push('body is not an HTML document');
    if (check.expect.assets) {
      const asset = /(?:src|href)="(\/[^"]+\.(?:js|css))"/u.exec(body)?.[1];
      if (!asset) failures.push('no script or stylesheet in the document');
      else {
        const assetResponse = await fetchImpl(`${options.origin}${asset}`, {
          redirect: 'manual',
        });
        if (assetResponse.status !== 200)
          failures.push(`asset ${asset} answered ${assetResponse.status}`);
      }
    }
    results.push({
      name: check.name,
      ok: failures.length === 0,
      status,
      ttfbMs,
      failures,
    });
  }
  return { ok: results.every((result) => result.ok), results };
}
