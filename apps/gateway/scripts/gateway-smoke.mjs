#!/usr/bin/env node
// Smoke checks for the tuturuuu.com gateway Worker.
//
//   node apps/gateway/scripts/gateway-smoke.mjs [--base https://tuturuuu.com]
//        [--origin https://<vercel web hostname>] [--expect-mode active|passthrough]
//
// Exits non-zero on the first failing group. Prints names and statuses only;
// it never prints cookie values or tokens.

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const base = option('base', 'https://tuturuuu.com').replace(/\/$/, '');
const origin = option('origin', '').replace(/\/$/, '');
const mode = option('expect-mode', 'active');

const PUBLIC_PATHS = [
  '/',
  '/about',
  '/careers',
  '/privacy',
  '/terms',
  '/security',
  '/products',
  '/products/tasks',
  '/solutions/education',
  '/legal/dpa',
  '/blog',
  '/changelog',
  '/contact',
  '/vi',
  '/vi/about',
  '/robots.txt',
  '/sitemap.xml',
];

const failures = [];
const fail = (message) => {
  failures.push(message);
  console.error(`FAIL ${message}`);
};
const pass = (message) => console.log(`ok   ${message}`);

async function get(path, init = {}) {
  return fetch(`${base}${path}`, { redirect: 'manual', ...init });
}

const cacheHeader = (response) => response.headers.get('x-gateway-cache');

// 1. Anonymous 200 on public URLs; cache MISS/HIT/STALE sequence.
for (const path of PUBLIC_PATHS) {
  const first = await get(path);
  if (first.status !== 200) {
    fail(`${path} anonymous status ${first.status}`);
    continue;
  }
  const second = await get(path);
  const states = `${cacheHeader(first)}->${cacheHeader(second)}`;
  if (mode === 'passthrough') {
    if (cacheHeader(second) !== 'PASSTHROUGH') {
      fail(`${path} expected PASSTHROUGH, saw ${states}`);
    } else pass(`${path} 200 ${states}`);
    continue;
  }
  if (!['HIT', 'STALE'].includes(cacheHeader(second))) {
    fail(`${path} second request not served from cache (${states})`);
  } else if (second.status !== 200) {
    fail(`${path} cached status ${second.status}`);
  } else pass(`${path} 200 ${states}`);
  for (const response of [first, second]) {
    if (
      ['HIT', 'MISS', 'STALE'].includes(cacheHeader(response) ?? '') &&
      response.headers.has('set-cookie')
    ) {
      fail(`${path} cacheable response carries Set-Cookie`);
    }
  }
}

// 2. Login page renders and is a pure pass-through.
{
  const response = await get('/login');
  if (response.status !== 200) fail(`/login status ${response.status}`);
  else if (mode === 'active' && cacheHeader(response) !== 'BYPASS') {
    fail(`/login expected BYPASS, saw ${cacheHeader(response)}`);
  } else pass(`/login 200 ${cacheHeader(response)}`);
}

// 3. Anonymous dashboard route redirects to login on the public host.
{
  const response = await get('/personal/tasks');
  const location = response.headers.get('location') ?? '';
  const redirected = response.status >= 300 && response.status < 400;
  let publicHost = true;
  try {
    publicHost = new URL(location, base).host === new URL(base).host;
  } catch {
    publicHost = false;
  }
  if (!redirected || !/login/i.test(location)) {
    fail(`/personal/tasks expected login redirect, saw ${response.status}`);
  } else if (!publicHost) {
    fail('/personal/tasks redirect leaves the public host');
  } else pass(`/personal/tasks ${response.status} -> login`);
}

// 4. Session cookies bypass the cache and the cookie reaches the origin path.
{
  const response = await get('/about', {
    headers: { cookie: 'sb-gatewaysmoke-auth-token=invalid' },
  });
  if (response.status >= 500) fail(`cookie request status ${response.status}`);
  else if (mode === 'active' && cacheHeader(response) !== 'BYPASS') {
    fail(`cookie request expected BYPASS, saw ${cacheHeader(response)}`);
  } else pass(`cookie request ${response.status} ${cacheHeader(response)}`);
  const auth = await get('/about', { headers: { authorization: 'Bearer x' } });
  if (mode === 'active' && cacheHeader(auth) !== 'BYPASS') {
    fail(`authorization request expected BYPASS, saw ${cacheHeader(auth)}`);
  } else pass(`authorization request ${auth.status} ${cacheHeader(auth)}`);
}

// 5. Set-Cookie passthrough: compare cookie names with the origin directly.
if (origin) {
  for (const path of ['/login', '/personal/tasks']) {
    const names = (response) =>
      response.headers
        .getSetCookie()
        .map((cookie) => cookie.split('=')[0])
        .sort()
        .join(',');
    const viaGateway = await get(path);
    const direct = await fetch(`${origin}${path}`, { redirect: 'manual' });
    if (names(viaGateway) !== names(direct)) {
      fail(
        `${path} Set-Cookie names differ (gateway "${names(viaGateway)}", origin "${names(direct)}")`
      );
    } else pass(`${path} Set-Cookie names match origin`);
  }
} else {
  console.log('skip Set-Cookie origin comparison (no --origin)');
}

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed`);
  process.exit(1);
}
console.log('\nall gateway smoke checks passed');
