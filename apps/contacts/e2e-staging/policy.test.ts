import assert from 'node:assert/strict';
import test from 'node:test';
import { stagingProfile } from '../cloudflare/profile.ts';
import {
  allowedRequest,
  localized,
  readConfig,
  relativePath,
  stagingOrigin,
} from './policy.ts';

const env = {
  CONTACTS_STAGING_SOURCE_SHA: 'a'.repeat(40),
  CONTACTS_STAGING_DISPOSABLE_ACCOUNT: 'confirmed',
  CONTACTS_STAGING_SUPABASE_PROJECT_REF: stagingProfile.supabaseRef,
  CONTACTS_STAGING_WORKSPACE_ID: 'disposable-workspace',
};
const config = readConfig(env);
test('hard host guard rejects prod and confusable destinations before browser launch', () => {
  for (const host of [
    'https://contacts.tuturuuu.com',
    'https://tuturuuu.com',
    'https://contacts.staging.tuturuuu.com',
    'https://contacts.staging.tutur3u.com.evil.test',
    'https://contacts.staging.tutur3u.cоm',
    'https://contacts.stаging.tutur3u.com',
    'https://contacts.staging.tutur3u.com.',
    'https://contacts.staging.tutur3u.com:444',
    'https://contacts.staging.tutur3u.com/path',
    'https://contacts.staging.tutur3u.com?x=1',
    'https://contacts.staging.tutur3u.com#x',
    'https://user:pass@contacts.staging.tutur3u.com',
    'http://contacts.staging.tutur3u.com',
    'https://example.workers.dev',
  ]) {
    assert.throws(() => stagingOrigin(host, 'contacts'));
    assert.throws(() =>
      readConfig({ ...env, CONTACTS_STAGING_BASE_URL: host })
    );
  }
  assert.equal(stagingOrigin(config.baseURL, 'contacts'), config.baseURL);
  assert.throws(() => stagingOrigin('https://tuturuuu.com', 'issuer'));
});
test('requires exact source, disposable consent and pinned non-production DB', () => {
  for (const overrides of [
    { CONTACTS_STAGING_SOURCE_SHA: 'short' },
    { CONTACTS_STAGING_DISPOSABLE_ACCOUNT: '' },
    { CONTACTS_STAGING_SUPABASE_PROJECT_REF: 'nzamlzqfdwaaxdefwraj' },
    { CONTACTS_STAGING_SUPABASE_PROJECT_REF: 'x'.repeat(20) },
    { CONTACTS_STAGING_WORKSPACE_ID: '' },
  ])
    assert.throws(() => readConfig({ ...env, ...overrides }));
});
test('EN/VI paths preserve query and cannot escape origin', () => {
  for (const locale of ['en', 'vi'] as const)
    assert.equal(
      localized('/ws/users?x=1&x=2', locale),
      `/${locale}/ws/users?x=1&x=2`
    );
  for (const path of [
    '//tuturuuu.com',
    'https://tuturuuu.com',
    '/\\evil.test',
    '/x#y',
    '/x\n',
  ])
    assert.throws(() => relativePath(path));
});
test('egress denies production and all tutoring, feedback, payment domain mutations', () => {
  for (const url of [
    'https://contacts.tuturuuu.com/ws/users',
    'https://tuturuuu.com/api/auth/login',
    'https://nzamlzqfdwaaxdefwraj.supabase.co/auth/v1/token',
    'https://contacts.staging.tutur3u.com.evil.test/api/auth/login',
  ]) {
    for (const method of ['GET', 'POST'])
      assert.equal(allowedRequest({ ...config, url, method }), false);
  }
  for (const path of [
    '/api/v1/workspaces/ws/users/feedbacks',
    '/api/v1/workspaces/ws/tutoring',
    '/api/payments',
    '/api/billing',
  ]) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
      assert.equal(
        allowedRequest({ ...config, url: config.baseURL + path, method }),
        false
      );
    assert.equal(
      allowedRequest({ ...config, url: config.baseURL + path, method: 'GET' }),
      true
    );
  }
});
test('only staging login and app-session refresh may write', () => {
  assert.equal(
    allowedRequest({
      ...config,
      url: `${config.baseURL}/api/auth/refresh-app-session`,
      method: 'POST',
    }),
    true
  );
  assert.equal(
    allowedRequest({
      ...config,
      url: `${config.supabaseOrigin}/auth/v1/token`,
      method: 'POST',
    }),
    true
  );
  assert.equal(
    allowedRequest({
      ...config,
      url: `${config.supabaseOrigin}/rest/v1/users`,
      method: 'POST',
    }),
    false
  );
  assert.throws(() =>
    allowedRequest({
      ...config,
      baseURL: 'https://contacts.tuturuuu.com',
      url: 'https://contacts.tuturuuu.com',
      method: 'GET',
    })
  );
});
