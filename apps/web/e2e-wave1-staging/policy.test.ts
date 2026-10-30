import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedRequest,
  apps,
  localized,
  readConfig,
  relativePath,
  required,
  stagingOrigin,
} from './policy.ts';

for (const app of apps) {
  test(`${app}: accepts only that app's explicit staging identity`, () => {
    assert.equal(
      stagingOrigin(`https://${app}.staging.tutur3u.com`, app),
      `https://${app}.staging.tutur3u.com`
    );
    assert.throws(() =>
      stagingOrigin(
        `https://tuturuuu-${app}-wave1-staging.example.workers.dev`,
        app
      )
    );
    for (const url of [
      `https://${app}.tuturuuu.com`,
      `https://${app}.staging.tuturuuu.com`,
      `https://${app}.staging.tutur3u.cоm`,
      new URL(`https://${app}.staging.tutur3u.cоm`).href,
      `https://${app}.stаging.tutur3u.com`,
      new URL(`https://${app}.stаging.tutur3u.com`).href,
      'https://tuturuuu.com',
      'https://www.tuturuuu.com',
      `https://tuturuuu-${app}.example.workers.dev`,
      `https://${app}.staging.tutur3u.com.evil.invalid`,
      `https://${app}.staging.tutur3u.com@evil.invalid`,
      `https://${app}.staging.tutur3u.com./`,
      `https://${app}.staging.tutur3u.com:8443`,
      `http://${app}.staging.tutur3u.com`,
      `https://${app}.staging.tutur3u.com/path`,
      `https://${app}.staging.tutur3u.com?next=prod`,
      `https://${app}.staging.tutur3u.com#prod`,
      `https://user:pass@${app}.staging.tutur3u.com`,
      'http://127.0.0.1',
      'not a URL',
    ])
      assert.throws(() => stagingOrigin(url, app));
  });
}

test('web issuer has its own off-canonical fence', () => {
  assert.equal(
    stagingOrigin('https://web.staging.tutur3u.com', 'issuer'),
    'https://web.staging.tutur3u.com'
  );
  assert.throws(() => stagingOrigin('https://tuturuuu.com', 'issuer'));
  assert.throws(() =>
    stagingOrigin('https://calendar.staging.tutur3u.com', 'issuer')
  );
});

test('paths cannot escape through absolute, scheme-relative or backslash URLs', () => {
  for (const path of [
    'https://tuturuuu.com',
    '//tuturuuu.com',
    '/\\tuturuuu.com',
    '/x#y',
    '/x\n',
  ]) {
    assert.throws(() => relativePath(path));
  }
  assert.equal(
    localized('/personal?tag=1&tag=2', 'vi'),
    '/vi/personal?tag=1&tag=2'
  );
  assert.equal(localized('/personal', 'en'), '/en/personal');
});

const config = {
  WAVE1_STAGING_SUPABASE_PROJECT_REF: 's'.repeat(20),
  WAVE1_PRODUCTION_SUPABASE_PROJECT_REF: 'p'.repeat(20),
  WAVE1_STAGING_APP: 'mail',
  WAVE1_STAGING_BASE_URL: 'https://mail.staging.tutur3u.com',
  WAVE1_STAGING_WEB_ORIGIN: 'https://web.staging.tutur3u.com',
  WAVE1_STAGING_DISPOSABLE_ACCOUNT: 'confirmed',
  WAVE1_STAGING_SOURCE_SHA: 'a'.repeat(40),
  WAVE1_STAGING_WORKSPACE_ID: 'disposable-workspace',
};

test('configuration fails before browser launch if required inputs are missing', () => {
  assert.equal(readConfig(config).app, 'mail');
  assert.equal(
    readConfig({ ...config, WAVE1_STAGING_BASE_URL: undefined }).baseURL,
    'https://mail.staging.tutur3u.com'
  );
  for (const key of Object.keys(config).filter(
    (name) =>
      !['WAVE1_STAGING_BASE_URL', 'WAVE1_STAGING_WEB_ORIGIN'].includes(name)
  )) {
    assert.throws(() => readConfig({ ...config, [key]: undefined }));
  }
  assert.throws(() =>
    readConfig({ ...config, WAVE1_STAGING_SOURCE_SHA: 'short' })
  );
  assert.throws(() => required({}, 'WAVE1_STAGING_PASSWORD'));
});

test('egress refuses production redirects, cross-origin assets and all Mail writes', () => {
  const input = {
    supabaseOrigin: `https://${'s'.repeat(20)}.supabase.co`,
    baseURL: config.WAVE1_STAGING_BASE_URL,
    webOrigin: config.WAVE1_STAGING_WEB_ORIGIN,
  };
  const permits = (url: string, method = 'GET') =>
    allowedRequest({ ...input, url, method });
  assert.ok(permits(`${input.baseURL}/api/v1/read`));
  assert.ok(permits(`${input.webOrigin}/api/v1/auth/password`, 'POST'));
  assert.ok(
    permits(`${input.baseURL}/api/v1/auth/cross-app-session/refresh`, 'POST')
  );
  for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
    assert.equal(
      permits(
        `${input.baseURL}/api/v1/workspaces/disposable/mail/send`,
        method
      ),
      false
    );
    assert.equal(
      permits(`${input.baseURL}/api/v1/webhooks/mail/cloudflare`, method),
      false
    );
  }
  for (const url of [
    'https://mail.tuturuuu.com/api/v1/read',
    'https://tuturuuu.com/login',
    'https://evil.invalid/a',
    'https://mail.staging.tutur3u.com.evil.invalid/',
  ]) {
    assert.equal(permits(url), false);
    assert.equal(permits(url, 'POST'), false);
  }
});

test('captcha permits only the fixed authentication service origin', () => {
  const cfg = readConfig(config);
  assert.equal(
    allowedRequest({
      ...cfg,
      method: 'POST',
      url: 'https://challenges.cloudflare.com/turnstile/fixture',
    }),
    true
  );
  assert.equal(
    allowedRequest({
      ...cfg,
      method: 'POST',
      url: 'https://challenges.cloudflare.com.evil.invalid/',
    }),
    false
  );
  assert.equal(
    allowedRequest({
      ...cfg,
      method: 'DELETE',
      url: 'https://challenges.cloudflare.com/',
    }),
    false
  );
});

test('Meet pre-join token issuance is scoped to the staging Meet endpoint', () => {
  const cfg = readConfig({
    ...config,
    WAVE1_STAGING_APP: 'meet',
    WAVE1_STAGING_BASE_URL: 'https://meet.staging.tutur3u.com',
  });
  const path = '/api/meet-call/00000000-0000-4000-8000-000000000000/token';
  assert.equal(
    allowedRequest({ ...cfg, method: 'POST', url: cfg.baseURL + path }),
    true
  );
  assert.equal(
    allowedRequest({
      ...cfg,
      method: 'POST',
      url: `https://meet.tuturuuu.com${path}`,
    }),
    false
  );
  assert.equal(
    allowedRequest({
      ...cfg,
      method: 'POST',
      url: cfg.baseURL + path.replace('/token', '/state'),
    }),
    false
  );
  assert.equal(
    allowedRequest({
      ...readConfig(config),
      method: 'POST',
      url: config.WAVE1_STAGING_BASE_URL + path,
    }),
    false
  );
});

test('HTTPS origins normalize uppercase hosts and the default :443 port', () => {
  for (const app of apps) {
    const origin = `https://${app}.staging.tutur3u.com`;
    assert.equal(stagingOrigin(origin.toUpperCase(), app), origin);
    assert.equal(stagingOrigin(`${origin}:443/`, app), origin);
  }
  assert.equal(
    stagingOrigin('HTTPS://WEB.STAGING.TUTUR3U.COM:443/', 'issuer'),
    'https://web.staging.tutur3u.com'
  );
});

test('browser configuration denies the public production project despite a false production label', () => {
  assert.throws(() =>
    readConfig({
      ...config,
      WAVE1_STAGING_SUPABASE_PROJECT_REF: 'nzamlzqfdwaaxdefwraj',
    })
  );
});

test('web candidate and central staging issuer share the canonical exact host', () => {
  const cfg = readConfig({
    ...config,
    WAVE1_STAGING_APP: 'web',
    WAVE1_STAGING_BASE_URL: undefined,
  });
  assert.equal(cfg.baseURL, 'https://web.staging.tutur3u.com');
  assert.equal(cfg.webOrigin, 'https://web.staging.tutur3u.com');
  assert.throws(() =>
    readConfig({
      ...config,
      WAVE1_STAGING_APP: 'web',
      WAVE1_STAGING_BASE_URL: 'https://tuturuuu.com',
    })
  );
  assert.throws(() => stagingOrigin('https://staging.tutur3u.com', 'web'));
  assert.equal(
    stagingOrigin('https://web.staging.tutur3u.com', 'issuer'),
    'https://web.staging.tutur3u.com'
  );
});
