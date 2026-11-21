#!/usr/bin/env node
// Smoke checks for the tuturuuu.com gateway Worker.
//
//   node apps/gateway/scripts/gateway-smoke.mjs [--base https://tuturuuu.com]
//
// Marketing pages come from the gateway cache (MISS, then HIT or STALE). Every
// Web path is served by a web family Worker over its service binding
// (x-gateway-cache FAMILY); there is no HTTP origin behind Web.
// Exits non-zero on the first failing group. Prints names and statuses only;
// it never prints cookie values or tokens.

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const base = option('base', 'https://tuturuuu.com').replace(/\/$/, '');

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
  '/contact',
  '/vi',
  '/vi/about',
];

/** Anonymous Web paths: served by a family, never by the gateway cache. */
const WEB_PATHS = ['/changelog', '/robots.txt', '/sitemap.xml'];

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

// 1. Anonymous 200 on Marketing pages; cache MISS/HIT/STALE sequence.
for (const path of PUBLIC_PATHS) {
  const first = await get(path);
  if (first.status !== 200) {
    fail(`${path} anonymous status ${first.status}`);
    continue;
  }
  const second = await get(path);
  const states = `${cacheHeader(first)}->${cacheHeader(second)}`;
  if (!['HIT', 'STALE'].includes(cacheHeader(second))) {
    fail(`${path} second request not served from cache (${states})`);
  } else if (second.status !== 200) {
    fail(`${path} cached status ${second.status}`);
  } else pass(`${path} 200 ${states}`);
  for (const response of [first, second]) {
    const state = cacheHeader(response) ?? '';
    const cookies = response.headers.getSetCookie?.() ?? [];
    // A stored copy never carries a cookie. The MISS that filled the cache may
    // keep the locale cookie the origin sets on every anonymous page.
    const onlyLocale =
      cookies.length > 0 &&
      cookies.every((cookie) => /^\s*NEXT_LOCALE=/i.test(cookie));
    if (
      (['HIT', 'STALE'].includes(state) && cookies.length > 0) ||
      (state === 'MISS' && cookies.length > 0 && !onlyLocale)
    ) {
      fail(`${path} cacheable response carries Set-Cookie (${state})`);
    }
  }
}

// 2. Web paths and the login page come from a web family.
for (const path of [...WEB_PATHS, '/login']) {
  const response = await get(path);
  if (response.status !== 200) fail(`${path} status ${response.status}`);
  else if (cacheHeader(response) !== 'FAMILY') {
    fail(`${path} expected FAMILY, saw ${cacheHeader(response)}`);
  } else {
    pass(`${path} 200 FAMILY ${response.headers.get('x-gateway-family')}`);
  }
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

// 4. Signed-in requests skip the cache and go to a web family.
{
  const response = await get('/about', {
    headers: { cookie: 'sb-gatewaysmoke-auth-token=invalid' },
  });
  if (response.status >= 500) fail(`cookie request status ${response.status}`);
  else if (cacheHeader(response) !== 'FAMILY') {
    fail(`cookie request expected FAMILY, saw ${cacheHeader(response)}`);
  } else pass(`cookie request ${response.status} FAMILY`);
  const auth = await get('/about', { headers: { authorization: 'Bearer x' } });
  if (cacheHeader(auth) !== 'FAMILY') {
    fail(`authorization request expected FAMILY, saw ${cacheHeader(auth)}`);
  } else pass(`authorization request ${auth.status} FAMILY`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed`);
  process.exit(1);
}
console.log('\nall gateway smoke checks passed');
