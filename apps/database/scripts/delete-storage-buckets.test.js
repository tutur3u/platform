import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSupabaseStorageAdminUrl,
  emptyBucket,
  parseProjectRef,
} from './delete-storage-buckets.js';

const VALID_PROJECT_REF = 'abcdefghijklmnopqrst';

test('parseProjectRef accepts canonical Supabase project refs', () => {
  assert.deepEqual(parseProjectRef(` ${VALID_PROJECT_REF}\n`), {
    ok: true,
    projectRef: VALID_PROJECT_REF,
  });
});

test('parseProjectRef rejects hostnames and path-like refs', () => {
  assert.deepEqual(parseProjectRef('evil.example/path'), {
    message:
      'Supabase project ref must be exactly 20 lowercase letters or digits.',
    ok: false,
  });
});

test('buildSupabaseStorageAdminUrl only targets Supabase project hosts', () => {
  assert.equal(
    buildSupabaseStorageAdminUrl(VALID_PROJECT_REF, '/bucket/avatars/empty'),
    `https://${VALID_PROJECT_REF}.supabase.co/storage/v1/bucket/avatars/empty`
  );
});

test('emptyBucket rejects invalid refs before sending service-role headers', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response(null, { status: 200 });
  };

  try {
    await assert.rejects(
      emptyBucket('evil.example/path', 'service-role-secret', 'avatars'),
      /Supabase project ref must be exactly 20 lowercase letters or digits\./u
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('emptyBucket sends service-role headers only to the validated Supabase URL', async () => {
  const originalFetch = globalThis.fetch;
  let call = null;

  globalThis.fetch = async (url, init) => {
    call = { init, url };
    return new Response(null, { status: 200 });
  };

  try {
    const response = await emptyBucket(
      VALID_PROJECT_REF,
      'service-role-secret',
      'support_inquiries'
    );

    assert.equal(response.status, 200);
    assert.equal(
      call.url,
      `https://${VALID_PROJECT_REF}.supabase.co/storage/v1/bucket/support_inquiries/empty`
    );
    assert.equal(call.init.headers.apikey, 'service-role-secret');
    assert.equal(call.init.headers.Authorization, 'Bearer service-role-secret');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
