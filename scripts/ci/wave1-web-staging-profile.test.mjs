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

test('no production identity appears in the Web staging entry', () => {
  const text = JSON.stringify(web);
  for (const app of Object.values(profiles.apps)) {
    assert.ok(!text.includes(app.productionWorker));
    assert.ok(!text.includes(app.canonicalHost));
  }
  assert.ok(!/\btuturuuu\.com\b/u.test(text.replaceAll('@tuturuuu', '')));
  assert.ok(!text.includes('nzamlzqfdwaaxdefwraj'));
});
