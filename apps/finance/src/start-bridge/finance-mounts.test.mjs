import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FINANCE_APEX_URL,
  financeBakedApexUrl,
  financeNativeMounts,
  isFinanceApexRoot,
} from './finance-mounts.mjs';

test('a production root host mounts tuturuuu.com and keeps the subdomain as root', () => {
  assert.deepEqual(financeNativeMounts('finance.tuturuuu.com'), {
    rootHosts: ['finance.tuturuuu.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/finance',
    unknownHost: 'reject',
  });
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
