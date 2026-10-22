import assert from 'node:assert/strict';
import { test } from 'vitest';
import { responseProxyProvenance } from '../../web/e2e/helpers/lettin-profile-navigation-diagnostics';

test('actual response header extraction retains only one bounded opaque ID', () => {
  const requestId = 'a'.repeat(32);
  const result = responseProxyProvenance({
    headers: () => ({
      'x-lettin-profile-request-id': requestId,
      'x-lettin-profile-proxy': 'intl|en|en|same',
      'set-cookie': 'private-cookie',
    }),
  });
  assert.equal('requestId' in result ? result.requestId : null, requestId);
  assert.doesNotMatch(JSON.stringify(result), /private-cookie/);
  for (const value of [
    '',
    'A'.repeat(32),
    'a'.repeat(33),
    `${requestId},${requestId}`,
  ]) {
    const observed = responseProxyProvenance({
      headers: () => ({ 'x-lettin-profile-request-id': value }),
    });
    assert.equal('requestId' in observed, false);
  }
  assert.deepEqual(
    responseProxyProvenance({
      headers: () => {
        throw new Error('headers');
      },
    }),
    {}
  );
});
