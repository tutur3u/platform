import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FINANCE_APEX_URL,
  financeBakedApexUrl,
  financeBuildBasePath,
  financeNativeMounts,
  isFinanceApexRoot,
} from './finance-mounts.mjs';

test('a production root host stays the subdomain and does not claim the apex', () => {
  assert.deepEqual(financeNativeMounts('finance.tuturuuu.com'), {
    rootHosts: ['finance.tuturuuu.com'],
    mountHosts: [],
    basePath: '/finance',
    unknownHost: 'reject',
  });
});

test('every native profile serves its public URL from its root host', () => {
  const profiles = JSON.parse(
    readFileSync(
      new URL('../../cloudflare/native-profiles.json', import.meta.url),
      'utf8'
    )
  );
  for (const [name, profile] of Object.entries(profiles)) {
    const root = `https://${profile.rootHost}`;
    assert.equal(profile.vars.NEXT_PUBLIC_APP_URL, root, name);
    assert.equal(profile.vars.FINANCE_APP_URL, root, name);
    assert.equal(financeBakedApexUrl(Object.values(profile.vars)), null, name);
  }
});

test('the Vite base stays empty so the subdomain root is not prefixed', () => {
  assert.equal(financeBuildBasePath(), '');
  const viteConfig = readFileSync(
    new URL('../../vite.config.mts', import.meta.url),
    'utf8'
  );
  assert.match(viteConfig, /basePath: financeBuildBasePath\(\)/);
  assert.equal(viteConfig.includes("'/finance'"), false);
  assert.equal(viteConfig.includes('"/finance"'), false);
});

test('staging and an undefined host do not mount the apex', () => {
  assert.deepEqual(financeNativeMounts('finance.tutur3u.com').mountHosts, []);
  assert.deepEqual(financeNativeMounts(undefined), {
    rootHosts: [],
    mountHosts: [],
    basePath: '/finance',
    unknownHost: 'reject',
  });
});

test('the apex cannot be the Finance root host', () => {
  assert.throws(
    () => financeNativeMounts('tuturuuu.com'),
    /rootHost must stay the subdomain/
  );
});

test('only the exact apex root is the baked public URL', () => {
  assert.equal(isFinanceApexRoot('https://tuturuuu.com/finance'), true);
  assert.equal(isFinanceApexRoot('https://tuturuuu.com/finance/'), true);
  assert.equal(
    financeBakedApexUrl([
      'https://finance.tuturuuu.com',
      'https://tuturuuu.com/finance/',
    ]),
    FINANCE_APEX_URL
  );
  for (const rejected of [
    'https://finance.tuturuuu.com',
    'https://tuturuuu.com',
    'https://tuturuuu.com/finance-billing',
    'https://tuturuuu.com/_f/finance-billing',
    'https://tuturuuu.com/finance/invoices',
    'https://tuturuuu.com/finance?next=/',
    'https://tuturuuu.com/finance#x',
    'https://tuturuuu.com/finance/../finance',
    'https://tuturuuu.com//finance',
    'https://tuturuuu.com/finance%2Fsecret',
    'https://tuturuuu.com%2Ffinance',
    'https://user:pass@tuturuuu.com/finance',
    'https://tuturuuu.com@evil.com/finance',
    'http://tuturuuu.com/finance',
    'https://tuturuuu.com:8443/finance',
    'https://evil.com/finance',
    'javascript:https://tuturuuu.com/finance',
  ]) {
    assert.equal(isFinanceApexRoot(rejected), false, rejected);
  }
  assert.equal(financeBakedApexUrl(['https://finance.tuturuuu.com']), null);
});
