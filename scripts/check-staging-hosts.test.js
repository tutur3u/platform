const { test } = require('node:test');
const assert = require('node:assert/strict');
const { violations, check } = require('./check-staging-hosts.js');
for (const host of [
  'pay-staging',
  'contacts.staging',
  'staging',
  'canary',
  'preview',
  'preview.pay',
]) {
  for (const prefix of [
    'rootHosts: ',
    'route = ',
    'URL=https://',
    'allowedHosts: ',
  ]) {
    test(host + prefix, () =>
      assert.equal(violations(prefix + host + '.tuturuuu.com').length, 1)
    );
  }
}
test('production and isolated staging allowed', () => {
  assert.deepEqual(
    violations('tuturuuu.com pay.tuturuuu.com pay.staging.tutur3u.com'),
    []
  );
});
test('repository configuration', () => assert.deepEqual(check(), []));

test('staging runtime regex cannot admit the production cookie zone', () => {
  assert.equal(violations('const STAGING_HOST = /tuturuuu\\.com/;').length, 1);
});
