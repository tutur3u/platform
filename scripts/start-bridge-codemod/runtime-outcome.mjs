// Declared page outcomes (`runtime` in start-bridge.routes.json). The codemod
// validates them and the generated native runtime test asserts them, so a
// broken or redirected public page can never pass as merely "not a 5xx".
// Plain ESM with no dependencies: the generated test imports it from source.

/** A non-5xx status, or `{ redirect }`: a path (same origin) or an absolute URL. */
function expectationProblem(route, expected) {
  if (typeof route !== 'string' || !route.startsWith('/'))
    return 'routes must be app-relative paths';
  if (typeof expected === 'number')
    return Number.isInteger(expected) && expected >= 200 && expected < 500
      ? null
      : 'a status must be a non-5xx integer';
  if (
    typeof expected === 'object' &&
    expected !== null &&
    !Array.isArray(expected) &&
    Object.keys(expected).length === 1 &&
    typeof expected.redirect === 'string' &&
    /^(?:\/(?!\/)|https?:\/\/[^/])/u.test(expected.redirect)
  )
    return null;
  return 'expected a non-5xx status or { "redirect": "<path or absolute URL>" }';
}

/**
 * Problems with a `runtime` map. It must be a non-empty record that declares
 * the root, so an empty, array or root-less map cannot drop the root check.
 */
export function runtimeExpectationProblems(runtime) {
  if (typeof runtime !== 'object' || runtime === null || Array.isArray(runtime))
    return ['runtime must be a record of app-relative paths to outcomes'];
  const problems = [];
  if (!Object.hasOwn(runtime, '/'))
    problems.push('runtime must declare the root "/"');
  for (const [route, expected] of Object.entries(runtime)) {
    const problem = expectationProblem(route, expected);
    if (problem) problems.push(`runtime[${JSON.stringify(route)}]: ${problem}`);
  }
  return problems;
}

/**
 * Why a response does not match its declared outcome, or `null`. `origin` is
 * the origin the request was addressed to and `base` the app mount (`''` at
 * the subdomain root, `/<app>` on the apex): a path redirect must stay on
 * that origin and keep the mount, so `/en` under `/forms` must land on
 * `/forms/en`, not `/en` or another app.
 */
export function runtimeOutcomeFailure({
  path,
  expected,
  status,
  location,
  origin,
  base = '',
}) {
  const outcome = `${mountedPath(base, path) || '/'}: ${status}${location ? ` -> ${location}` : ''}`;
  if (typeof expected === 'number')
    return status === expected ? null : `${outcome}; expected ${expected}`;
  if (status < 300 || status >= 400 || !location)
    return `${outcome}; expected a redirect to ${expected.redirect}`;
  const target = new URL(location, origin);
  if (!expected.redirect.startsWith('/'))
    return target.href.startsWith(expected.redirect)
      ? null
      : `${outcome}; expected ${expected.redirect}`;
  if (target.host !== new URL(origin).host)
    return `${outcome}; expected a same-origin redirect to ${base}${expected.redirect}`;
  const want = `${base}${expected.redirect}`;
  const actual = `${target.pathname}${target.search}`;
  const matches =
    expected.redirect === '/' && base
      ? actual === base ||
        actual.startsWith(`${base}/`) ||
        actual.startsWith(`${base}?`)
      : actual.startsWith(want);
  return matches ? null : `${outcome}; expected ${want}`;
}

/** The apex path for an app-relative one (`/` is the mount itself). */
export function mountedPath(base, path) {
  return path === '/' ? base : `${base}${path}`;
}

const PROBE_KINDS = ['page', 'api', 'notFound'];
const PROBE_DEFAULTS = {
  page: 'an anonymous page rendering 200 HTML',
  api: 'an anonymous API route answering 200 JSON',
  notFound: 'a path the app answers with its 404 HTML page',
};

/**
 * The response-policy probes of the generated runtime gate: each must be a
 * real rendered page, JSON API response and 404 page, never a redirect.
 * Defaults: the first `runtime` path expecting 200, `/api/build-info`, and
 * `/__native-smoke-missing__`. `runtimeProbes` in start-bridge.routes.json
 * overrides a probe path or skips it with a reason (an auth-only app covers
 * it with its isolated auth fixture in its own `cloudflare/*.runtime.mjs`).
 */
export function resolveRuntimeProbes(declared, { expectations, hasBuildInfo }) {
  const problems = [];
  if (
    declared !== undefined &&
    (typeof declared !== 'object' ||
      declared === null ||
      Array.isArray(declared))
  )
    return { probes: [], problems: ['runtimeProbes must be an object'] };
  for (const key of Object.keys(declared ?? {}))
    if (!PROBE_KINDS.includes(key))
      problems.push(
        `runtimeProbes.${key} is not a probe (page, api, notFound)`
      );
  const defaults = {
    page: Object.entries(expectations ?? {}).find(
      ([, expected]) => expected === 200
    )?.[0],
    api: hasBuildInfo ? '/api/build-info' : undefined,
    notFound: '/__native-smoke-missing__',
  };
  const probes = [];
  for (const kind of PROBE_KINDS) {
    const value = declared?.[kind] ?? defaults[kind];
    if (typeof value === 'string' && /^\/(?!\/)/u.test(value))
      probes.push({ kind, path: value });
    else if (
      value &&
      typeof value === 'object' &&
      Object.keys(value).length === 1 &&
      typeof value.skip === 'string' &&
      value.skip.trim()
    )
      probes.push({ kind, skip: value.skip.trim() });
    else
      problems.push(
        `runtimeProbes.${kind}: declare ${PROBE_DEFAULTS[kind]} (an app-relative path), or { "skip": "<reason>" }`
      );
  }
  return { probes, problems };
}
