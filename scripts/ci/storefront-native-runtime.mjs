import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Storefront's sealed Worker serves its canonical store host and answers its
// alias hosts with a redirect to it, so the generic wave-1 identity probes
// (build identity 200 on the attached host) apply to the canonical host only.
const PROFILES = JSON.parse(
  readFileSync(
    new URL(
      '../../apps/storefront/cloudflare/native-profiles.json',
      import.meta.url
    ),
    'utf8'
  )
);
const { rootHost, aliasHosts } = PROFILES.production;
export const STOREFRONT_ROOT_HOST = rootHost;
export const STOREFRONT_ALIAS_HOSTS = Object.freeze([...aliasHosts]);
const UNKNOWN_HOST = 'unknown-host.invalid';
// An unknown asset path is a 404; any other unknown path is a storefront slug
// that the inventory supplier would answer, which anonymous acceptance denies.
const MISSING_ASSET = '/assets/__native-smoke-missing__.js';
const UNREGISTERED_API = '/api/__native-smoke-missing__';

/** Hosts a sealed production artifact is exercised under, attached host first. */
export function storefrontRuntimeHosts(profile) {
  assert.ok(
    profile.host === rootHost || aliasHosts.includes(profile.host),
    `Storefront publishes only ${rootHost} or its redirect aliases, got ${profile.host}`
  );
  return [...new Set([profile.host, rootHost, aliasHosts[0], UNKNOWN_HOST])];
}

export function storefrontHostKind(host) {
  if (host === rootHost) return 'canonical';
  if (aliasHosts.includes(host)) return 'alias';
  return 'unknown';
}

const describe = (host, method, path, response) =>
  `${host} ${method} ${path} -> ${response.status}${
    response.headers.get('location')
      ? ` Location ${response.headers.get('location')}`
      : ''
  } cache-control=${response.headers.get('cache-control') ?? '-'}`;

// A signed-out visitor may receive only the locale preference cookie.
function assertPolicyHeaders(response, label, { locale = false } = {}) {
  assert.equal(
    response.headers.get('x-robots-tag'),
    'noindex, nofollow',
    `${label}: noindex header`
  );
  assert.equal(
    response.headers.get('strict-transport-security'),
    'max-age=63072000',
    `${label}: HSTS`
  );
  const cookies = response.headers.getSetCookie();
  assert.ok(
    cookies.every((cookie) => locale && cookie.startsWith('NEXT_LOCALE=')),
    `${label}: unexpected cookies ${JSON.stringify(cookies)}`
  );
}

/**
 * Probe one host of the sealed Storefront artifact. `fetchWorker(path, init)`
 * sends the request with the host's Host header and never follows redirects.
 * Returns one observation line per probe for the qualification log.
 */
export async function exerciseStorefrontHost({
  host,
  fetchWorker,
  sha,
  environment,
  assetFile,
  assetBytes,
}) {
  const observations = [];
  const probe = async (method, path, init = {}) => {
    const response = await fetchWorker(path, { method, ...init });
    observations.push(describe(host, method, path, response));
    return response;
  };
  const kind = storefrontHostKind(host);
  if (kind === 'unknown') {
    for (const path of ['/', '/api/build-info']) {
      const refused = await probe('GET', path);
      assert.equal(refused.status, 404, `${host}${path} must 404`);
      assert.equal(await refused.text(), 'Not Found');
      assert.deepEqual(refused.headers.getSetCookie(), []);
    }
    return observations;
  }
  if (kind === 'alias') {
    // Parity with the Vercel alias: every path and query moves to the root host.
    for (const path of [
      '/',
      '/api/build-info',
      '/orders?tag=a&tag=b',
      '/assets/missing.js',
    ]) {
      const moved = await probe('GET', path);
      assert.equal(moved.status, 307, `${host}${path} must redirect`);
      assert.equal(
        moved.headers.get('location'),
        `https://${rootHost}${path}`,
        `${host}${path} redirect target`
      );
      assert.equal(await moved.text(), '');
      assertPolicyHeaders(moved, `${host}${path}`);
    }
    return observations;
  }

  const identity = await probe('GET', '/api/build-info');
  assert.equal(identity.status, 200, 'Native build identity must be reachable');
  assert.match(identity.headers.get('cache-control'), /no-store/);
  const info = await identity.json();
  assert.equal(info.appName, 'storefront');
  assert.equal(info.commitHash, sha, 'Actual bundled source identity differs');
  assert.equal(info.environment, environment);
  assertPolicyHeaders(identity, `${host}/api/build-info`, { locale: true });
  const head = await probe('HEAD', '/api/build-info');
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  // The proxy refuses an unregistered anonymous mutation before any route.
  const post = await probe('POST', '/api/build-info');
  assert.equal(post.status, 401, 'Identity route must not accept mutations');

  const root = await probe('GET', '/');
  assert.equal(root.status, 307);
  assert.equal(root.headers.get('location'), '/demo');
  assertPolicyHeaders(root, `${host}/`, { locale: true });

  // Signed-out protected page: same hand-off as the live canonical host.
  const orders = await probe('GET', '/orders');
  assert.equal(orders.status, 307, 'Anonymous orders page must redirect');
  assert.equal(
    orders.headers.get('location'),
    `https://${host}/login?next=%2Forders`
  );
  assert.match(orders.headers.get('cache-control'), /no-store/);
  assertPolicyHeaders(orders, `${host}/orders`, { locale: true });

  const login = await probe('GET', '/login');
  assert.equal(login.status, 307, 'Login must hand off to central login');
  const target = new URL(login.headers.get('location'));
  assert.equal(target.origin, 'https://tuturuuu.com');
  assert.equal(target.pathname, '/login');
  assert.equal(
    new URL(target.searchParams.get('returnUrl')).origin,
    `https://${host}`
  );

  // Actual static bytes must survive original and restored workerd execution.
  const asset = await probe('GET', `/${assetFile}`);
  assert.equal(asset.status, 200);
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), assetBytes);
  assert.equal(asset.headers.get('x-robots-tag'), 'noindex, nofollow');
  const robots = await probe('GET', '/robots.txt');
  assert.equal(robots.status, 200);

  const missing = await probe('GET', MISSING_ASSET);
  assert.equal(missing.status, 404, `${MISSING_ASSET}: ${missing.status}`);
  const api = await probe('GET', UNREGISTERED_API);
  assert.equal(api.status, 401, `${UNREGISTERED_API}: ${api.status}`);
  assert.match(api.headers.get('cache-control'), /no-store/);
  return observations;
}

export function storefrontAssetFile(receipt) {
  const file = Object.keys(receipt.files).find(
    (name) => name.startsWith('client/assets/') && name.endsWith('.js')
  );
  assert.ok(file, 'Native client asset missing');
  return file.slice('client/'.length);
}

export function readStorefrontAsset(appRoot, assetFile) {
  return readFileSync(join(appRoot, 'dist/client', assetFile));
}
