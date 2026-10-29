import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prepare, verify } from './wave1-native-artifact.mjs';
import { assertStagingIsolation, profileFor } from './wave1-native-profile.mjs';
import { fixture } from './wave1-native-test-fixture.cjs';

const sha = 'a'.repeat(40);

test('Calendar staging profile uses its custom staging hostname', () => {
  const profile = profileFor('calendar', 'staging', 'owner-example');
  assert.equal(profile.host, 'calendar.staging.tutur3u.com');
});

test('Calendar staging seal restores its explicit host without a provider subdomain', (t) => {
  assert.equal(
    profileFor('calendar', 'staging').host,
    'calendar.staging.tutur3u.com'
  );
  const app = fixture(t, 'calendar');
  const receipt = prepare(app, 'calendar', 'staging', undefined, sha);
  const restored = verify(app, 'calendar', 'staging', sha);
  assert.deepEqual(restored.receipt, receipt);
  const config = JSON.parse(readFileSync(restored.config, 'utf8'));
  assertStagingIsolation(config);
  assert.equal(
    config.vars.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN,
    '.staging.tutur3u.com'
  );
  assert.equal(
    config.vars.NEXT_PUBLIC_WEB_APP_URL,
    'https://web.staging.tutur3u.com'
  );
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.equal(
    config.vars.NEXT_PUBLIC_CALENDAR_APP_URL,
    'https://calendar.staging.tutur3u.com'
  );
  assert.equal(
    config.vars.GOOGLE_REDIRECT_URI,
    'https://calendar.staging.tutur3u.com/api/v1/calendar/auth/callback'
  );
  assert.equal(
    config.vars.MICROSOFT_REDIRECT_URI,
    'https://calendar.staging.tutur3u.com/api/v1/calendar/auth/microsoft/callback'
  );
});

test('production and other apps keep their existing profile identities', () => {
  assert.equal(
    profileFor('calendar', 'production').host,
    'calendar.tuturuuu.com'
  );
  for (const app of ['mail', 'apps']) {
    assert.match(
      profileFor(app, 'staging', 'owner-example').host,
      /\.owner-example\.workers\.dev$/u
    );
    assert.throws(
      () => profileFor(app, 'staging'),
      /CLOUDFLARE_WORKERS_SUBDOMAIN/u
    );
  }
});

test('production Worker configs never set a shared cookie-domain override', (t) => {
  // Cloudflare Workers have no VERCEL_ENV, so the runtime production guard
  // cannot fire there; the published production vars must omit the override.
  const { apps } = JSON.parse(
    readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
  );
  for (const app of Object.keys(apps)) {
    const root = fixture(t, app);
    prepare(root, app, 'production', undefined, sha);
    const restored = verify(root, app, 'production', sha);
    const config = JSON.parse(readFileSync(restored.config, 'utf8'));
    assert.equal(
      Object.hasOwn(config.vars, 'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN'),
      false,
      app
    );
  }
  const finance = JSON.parse(
    readFileSync(
      new URL(
        '../../apps/finance/cloudflare/native-profiles.json',
        import.meta.url
      )
    )
  );
  assert.equal(
    Object.hasOwn(
      finance.production.vars,
      'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN'
    ),
    false
  );
});
