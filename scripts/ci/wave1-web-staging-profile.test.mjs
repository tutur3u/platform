import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { profiles } from './wave1-native-profile.mjs';

const web = profiles.webStaging;
const source = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the Web staging entry is ingress-admitted and outside the no-ingress publisher', () => {
  assert.ok(web, 'webStaging profile entry is required');
  // The legacy wave-1 publisher refuses ingress, so Web must never be listed there.
  assert.equal(Object.hasOwn(profiles.apps, 'web'), false);
  assert.equal(web.ingress, 'access-custom-domain');
  assert.equal(web.stagingHost, 'web.staging.tutur3u.com');
  assert.equal(web.zone, 'tutur3u.com');
  assert.equal(web.stagingWorker, 'tuturuuu-web-wave1-staging');
  assert.match(
    source('apps/web/cloudflare/void.config.ts'),
    new RegExp(`name: '${web.sourceWorker}'`)
  );
});

test('the entry agrees with the candidate profile and admission inputs', () => {
  const profile = source('apps/web/cloudflare/profile.ts');
  assert.match(
    profile,
    new RegExp(`host: '${web.stagingHost.replaceAll('.', '\\.')}'`)
  );
  assert.match(
    profile,
    new RegExp(
      `cookieDomain: '${web.vars.AUTH_COOKIE_DOMAIN.replaceAll('.', '\\.')}'`
    )
  );
  assert.match(
    profile,
    new RegExp(
      `supabaseUrl: '${web.vars.NEXT_PUBLIC_SUPABASE_URL.replaceAll('.', '\\.')}'`
    )
  );
  assert.equal(web.vars.WEB_START_CANDIDATE, 'staging');
  assert.equal(web.vars.WEB_START_NATIVE_LEGAL, 'off');
  assert.equal(web.vars.WEB_START_NATIVE_SECURITY, 'off');
  // NEXT_FALLBACK_ORIGIN is sealed per publication (design §2.2), never a fixed var.
  assert.equal(Object.hasOwn(web.vars, 'NEXT_FALLBACK_ORIGIN'), false);
  for (const name of web.secrets)
    assert.match(profile, new RegExp(`${name}\\?: string`));
  assert.deepEqual([...web.secrets].sort(), [
    'CF_ACCESS_AUD',
    'CF_ACCESS_TEAM_DOMAIN',
    'TRUSTED_PROXY_ORIGIN_SECRET',
    'VERCEL_AUTOMATION_BYPASS_SECRET',
  ]);
  assert.equal(web.nextFallback.vercelProject, 'tuturuuu-web-staging');
  assert.equal(web.nextFallback.target, 'staging');
  JSON.parse(source(web.nextFallback.config));
});

// Every string (keys and values, recursively) in a JSON value.
function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, item]) => [
      key,
      ...strings(item),
    ]);
  return [];
}

/**
 * Host-like tokens that name the production zone. Splits on anything outside
 * [A-Za-z0-9.-], so URLs, ports, cookie domains and embedded text all yield
 * their host. A token directly after '@' is a package scope, not a host.
 */
function productionZoneHosts(value) {
  const found = [];
  for (const match of value.matchAll(/[A-Za-z0-9.-]+/gu)) {
    if (value[match.index - 1] === '@') continue;
    // Leading dots (cookie domains) and trailing dots (FQDN form) are not
    // part of the host name.
    const host = match[0].replace(/^\.+|\.+$/gu, '').toLowerCase();
    if (
      host === 'tuturuuu.com' ||
      host.endsWith('.tuturuuu.com') ||
      host.startsWith('tuturuuu.com.')
    )
      found.push(host);
  }
  return found;
}

test('the production-zone host scan flags every host form and spares package scopes', () => {
  for (const sample of [
    'https://calendar.tuturuuu.com/x',
    'tuturuuu.com',
    'api.tuturuuu.com',
    '.tuturuuu.com',
    'tuturuuu.com:443',
    'redirect to tuturuuu.com now',
    'tuturuuu.com.evil.test',
    'https://x.tuturuuu.com/a',
    'calendar.tuturuuu.com',
    'TUTURUUU.COM',
    'calendar.tuturuuu.com.',
    'https://calendar.tuturuuu.com./x',
    'tuturuuu.com.',
  ])
    assert.notDeepEqual(productionZoneHosts(sample), [], sample);
  for (const sample of [
    '@tuturuuu/utils',
    'web.staging.tutur3u.com',
    'https://calendar.staging.tutur3u.com/x',
    'tuturuuu-web-staging',
    'tuturuuu-web-wave1-staging',
  ])
    assert.deepEqual(productionZoneHosts(sample), [], sample);
});

test('no production identity appears in the Web staging entry', () => {
  const values = strings(web);
  for (const app of Object.values(profiles.apps)) {
    // Canonical hosts are production-zone hosts, so the scan below covers them.
    assert.ok(productionZoneHosts(app.canonicalHost).length > 0);
    assert.ok(!values.some((value) => value.includes(app.productionWorker)));
  }
  assert.deepEqual(values.flatMap(productionZoneHosts), []);
  assert.ok(!values.some((value) => value.includes('nzamlzqfdwaaxdefwraj')));
});
