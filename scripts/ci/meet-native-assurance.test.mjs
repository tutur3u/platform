import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMeetPolicy } from './meet-native-policy.mjs';

const key = 'a'.repeat(72);
const url =
  'https://meet-ci.supabase.invalid/auth/v1/admin/users/be0e8f2e-c239-4e40-a1f4-d6881938cae4';
function request(target = url, options = {}) {
  return new Request(target, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    ...options,
  });
}
test('exact synthetic account assurance remains distinct from central forwarding and bounded to eight reads', async () => {
  const policy = createMeetPolicy('app', { assuranceKey: key });
  for (let i = 0; i < 8; i++) {
    const response = await policy.handler(request());
    assert.equal(response.status, 200);
    const user = await response.json();
    assert.equal(user.id, 'be0e8f2e-c239-4e40-a1f4-d6881938cae4');
    assert.equal(user.email_confirmed_at, '2026-01-01T00:00:00.000Z');
    assert.equal(user.banned_until, null);
    assert.deepEqual(user.app_metadata, {
      tuturuuu_required_mfa: { required: false },
    });
  }
  assert.equal(policy.assurance.length, 8);
  assert.equal(policy.forwarded.length, 0);
  assert.equal((await policy.handler(request())).status, 599);
  assert.equal(policy.assurance.length, 8);
  assert.equal(policy.unexpected.length, 1);
});
for (const [name, make] of [
  ['subject', () => request(url.replace('be0e8f2e', 'ae0e8f2e'))],
  [
    'origin',
    () => request(url.replace('meet-ci.supabase.invalid', 'supabase.invalid')),
  ],
  [
    'lookalike',
    () =>
      request(
        url.replace(
          'meet-ci.supabase.invalid',
          'meet-ci.supabase.invalid.untrusted.invalid'
        )
      ),
  ],
  ['method', () => request(url, { method: 'POST' })],
  [
    'authorization',
    () =>
      request(url, { headers: { apikey: key, authorization: 'Bearer wrong' } }),
  ],
  [
    'apikey',
    () =>
      request(url, {
        headers: { apikey: 'wrong', authorization: `Bearer ${key}` },
      }),
  ],
  [
    'URL credentials',
    () =>
      Object.defineProperty(request(), 'url', {
        value: url.replace('https://', 'https://user@'),
      }),
  ],
  ['query', () => request(`${url}?extra=1`)],
  [
    'cookie',
    () =>
      request(url, {
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          cookie: 'ambient=value',
        },
      }),
  ],
])
  test(`assurance fixture denies wrong ${name}`, async () => {
    const policy = createMeetPolicy('app', { assuranceKey: key });
    assert.equal((await policy.handler(make())).status, 599);
    assert.equal(policy.assurance.length, 0);
    assert.equal(policy.unexpected.length, 1);
  });

test('assurance credentials are captured and cannot be widened by mutating constructor options', async () => {
  const options = { assuranceKey: key };
  const policy = createMeetPolicy('app', options);
  options.assuranceKey = 'b'.repeat(72);
  assert.equal((await policy.handler(request())).status, 200);
  assert.equal(
    (
      await policy.handler(
        request(url, {
          headers: {
            apikey: options.assuranceKey,
            authorization: `Bearer ${options.assuranceKey}`,
          },
        })
      )
    ).status,
    599
  );
  assert.equal(
    (await createMeetPolicy('probe').handler(request())).status,
    599
  );
  assert.equal((await createMeetPolicy('app').handler(request())).status, 599);
  assert.throws(() => createMeetPolicy('probe', { assuranceKey: key }));
  assert.throws(() =>
    createMeetPolicy('app', { assuranceKey: key, allowDomain: true })
  );
});
