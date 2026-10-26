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
