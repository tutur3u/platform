import assert from 'node:assert/strict';

export function assertCentralLoginRedirect({ status, location }, returnUrl) {
  assert.ok(status >= 300 && status < 400, `Login redirect status: ${status}`);
  const target = new URL(location);
  assert.equal(target.origin, 'https://tuturuuu.com');
  assert.equal(target.pathname, '/login');
  assert.equal(target.username, '');
  assert.equal(target.password, '');
  assert.equal(target.searchParams.getAll('returnUrl').length, 1);
  assert.equal(target.searchParams.get('returnUrl'), returnUrl);
}
