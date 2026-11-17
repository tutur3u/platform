import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupEmail, ACCOUNTS, newReceipt } from './fleet-qa.mjs';
import { config, ids, fixture, clock } from './fleet-qa-fixture.mjs';
const origin = 'https://abcdefghijklmnopqrst.supabase.co';
const secret = 'synthetic-service-credential';
function transport(body, status = 200) {
  const requests = [];
  return {
    requests,
    fetch: async (url, init) => {
      const u = new URL(url);
      assert.equal(u.origin, origin);
      assert.equal(u.pathname, '/auth/v1/admin/users');
      assert.deepEqual(
        [...u.searchParams],
        [
          ['filter', ACCOUNTS.a1],
          ['per_page', '2'],
          ['page', '1'],
        ]
      );
      assert.equal(init.method, 'GET');
      assert.equal(init.cache, 'no-store');
      assert.equal(init.headers.Authorization, `Bearer ${secret}`);
      assert.equal(init.headers.apikey, secret);
      requests.push({ method: init.method, path: u.pathname });
      return new Response(JSON.stringify(body), { status });
    },
  };
}
test('alias lookup is one filtered service-role GET with exact 0/1 semantics', async () => {
  for (const present of [false, true]) {
    const t = transport({
      users: present ? [{ id: ids[0], email: ACCOUNTS.a1 }] : [],
    });
    assert.equal(
      await lookupEmail(t.fetch, origin, secret, ACCOUNTS.a1),
      present
    );
    assert.equal(t.requests.length, 1);
  }
});
test('alias lookup refuses anomalies without pagination, retry, or error detail', async () => {
  for (const body of [
    {},
    { users: null },
    { users: [{ id: ids[0], email: ACCOUNTS.a1.toUpperCase() }] },
    { users: [{ id: ids[0], email: ACCOUNTS.a2 }] },
    {
      users: [
        { id: ids[0], email: ACCOUNTS.a1 },
        { id: ids[1], email: ACCOUNTS.a1 },
      ],
    },
    { users: [{ id: 'invalid', email: ACCOUNTS.a1 }] },
  ]) {
    const t = transport(body);
    await assert.rejects(
      lookupEmail(t.fetch, origin, secret, ACCOUNTS.a1),
      /^Error: ALIAS_LOOKUP_FAILED$/
    );
    assert.equal(t.requests.length, 1);
  }
  for (const status of [400, 401, 429, 500]) {
    const t = transport({ message: 'RAW_SECRET' }, status);
    await assert.rejects(
      lookupEmail(t.fetch, origin, secret, ACCOUNTS.a1),
      /^Error: ALIAS_LOOKUP_FAILED$/
    );
    assert.equal(t.requests.length, 1);
  }
  let attempts = 0;
  const fail = async () => {
    attempts++;
    throw new Error('RAW_SECRET');
  };
  await assert.rejects(
    lookupEmail(fail, origin, secret, ACCOUNTS.a1),
    /^Error: ALIAS_LOOKUP_FAILED$/
  );
  assert.equal(attempts, 1);
});
test('unapproved or wildcard aliases stop before transport', async () => {
  let count = 0;
  const supplier = async () => {
    count++;
    return new Response('{}');
  };
  for (const email of [
    'other@tuturuuu.com',
    'qa%d241h-a1@tuturuuu.com',
    'qa_d241h-a1@tuturuuu.com',
    'qa\\d241h-a1@tuturuuu.com',
    ' qa-d241h-a1@tuturuuu.com',
    ACCOUNTS.a1.toUpperCase(),
  ])
    await assert.rejects(lookupEmail(supplier, origin, secret, email));
  assert.equal(count, 0);
});
test('receipt records UNKNOWN access-token lifetime without a config read', () => {
  assert.equal(newReceipt(config, clock()).accessTokenLifetime, 'UNKNOWN');
});
test('all-false platform role tombstone is counted without profile-column assumptions', async () => {
  const f = fixture();
  await f.helper.provision();
  f.profiles.platform_user_roles = [
    { user_id: ids[0], enabled: false, created_at: null },
  ];
  const result = await f.helper.delete('a1');
  assert.equal(result.residuals.platform_user_roles, 1);
  assert.equal(f.profiles.platform_user_roles.length, 1);
});

test('per-row creator readback denies a mismatch even when inventory membership matches', async () => {
  const f = fixture();
  await f.helper.provision();
  const from = f.client.from;
  f.client.from = (table) => {
    const q = from(table);
    const eq = q.eq;
    const then = q.then;
    let byId = false;
    q.eq = (key, value) => {
      byId ||= key === 'id';
      return eq(key, value);
    };
    q.then = (yes, no) =>
      then(
        (result) =>
          yes(
            table === 'workspaces' && byId
              ? {
                  ...result,
                  data: result.data.map((row) => ({
                    ...row,
                    creator_id: ids[1],
                  })),
                }
              : result
          ),
        no
      );
    return q;
  };
  await assert.rejects(f.helper.delete('a1'));
  assert.equal(
    f.calls.some(
      (c) => c[0] === 'delete' || (c[0] === 'table' && c[2] === 'delete')
    ),
    false
  );
});
