import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { expect, it, vi } from 'vitest';
import { getInfrastructureUsers } from './queries';

// Resolve the actual SDK from its owning workspace, without a source alias or
// mocked query builder. Only its HTTP boundary receives synthetic responses.
const packageRequire = createRequire(
  resolve(process.cwd(), '../../packages/supabase/package.json')
);
const { createClient } = packageRequire('@supabase/supabase-js') as {
  createClient: (
    url: string,
    key: string,
    options: {
      auth: {
        persistSession: boolean;
        autoRefreshToken: boolean;
        detectSessionInUrl: boolean;
      };
      global: { fetch: typeof fetch };
    }
  ) => TypedSupabaseClient;
};

const publicRow = {
  id: '11111111-1111-4111-8111-111111111111',
  display_name: 'Synthetic public name',
  handle: 'synthetic_handle',
  created_at: '2026-01-01T00:00:00Z',
};
const profile = {
  email: 'synthetic@example.invalid',
  full_name: 'Private name',
};

function fixture(rows: unknown[] = [], count = rows.length, status = 200) {
  const requests: URL[] = [];
  const fetchBoundary = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    if (
      url.origin !== 'https://directory.invalid' ||
      url.pathname !== '/rest/v1/users'
    )
      throw new Error('Unexpected SDK transport destination');
    requests.push(url);
    return new Response(
      JSON.stringify(
        status === 200 ? rows : { message: 'Synthetic query failure' }
      ),
      {
        status,
        headers: {
          'Content-Type': 'application/json',
          'Content-Range': `0-9/${count}`,
        },
      }
    );
  });
  const admin = createClient('https://directory.invalid', 'synthetic-key', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchBoundary },
  });
  const authorize = vi.fn(async () => {});
  const createAdminClient = vi.fn(async () => admin);
  return { requests, authorize, createAdminClient, fetchBoundary };
}

it('denies access before constructing the admin client or sending any query', async () => {
  const f = fixture();
  const denied = new Error('Synthetic permission denied');
  f.authorize.mockRejectedValueOnce(denied);
  await expect(getInfrastructureUsers({ q: 'synthetic' }, f)).rejects.toBe(
    denied
  );
  expect(f.createAdminClient).not.toHaveBeenCalled();
  expect(f.fetchBoundary).not.toHaveBeenCalled();
});

it('constructs private email/full-name OR alongside public name/handle in one SDK request', async () => {
  const f = fixture([{ ...publicRow, profile }], 37);
  const result = await getInfrastructureUsers(
    { q: 'synthetic', page: '2', pageSize: '10' },
    f
  );
  expect(f.fetchBoundary).toHaveBeenCalledTimes(1);
  expect(f.authorize.mock.invocationCallOrder[0]).toBeLessThan(
    f.createAdminClient.mock.invocationCallOrder[0]!
  );
  const query = f.requests[0]!.searchParams;
  expect(query.get('select')).toBe(
    'id,display_name,handle,created_at,profile:user_private_details(email,full_name),private_match:user_private_details()'
  );
  expect(query.get('private_match.or')).toBe(
    '(email.imatch."synthetic",full_name.imatch."synthetic")'
  );
  expect(query.get('or')).toBe(
    '(display_name.imatch."synthetic",handle.imatch."synthetic",private_match.not.is.null)'
  );
  expect(query.get('order')).toBe('created_at.desc,id.desc');
  expect(query.get('offset')).toBe('10');
  expect(query.get('limit')).toBe('10');
  expect(
    new Headers(f.fetchBoundary.mock.calls[0]![1]?.headers).get('prefer')
  ).toContain('count=exact');
  expect(result.count).toBe(37);
  expect(result.data).toEqual([{ ...publicRow, email: profile.email }]);
});

it('keeps displayed private data unfiltered and preserves users without a private profile', async () => {
  const f = fixture([
    {
      ...publicRow,
      profile: {
        ...profile,
        new_email: 'must-not-expose@example.invalid',
        birthday: '2000-01-01',
      },
    },
    { ...publicRow, id: '22222222-2222-4222-8222-222222222222', profile: null },
    {
      ...publicRow,
      id: '33333333-3333-4333-8333-333333333333',
      display_name: null,
      profile,
    },
  ]);
  const result = await getInfrastructureUsers({ q: 'public' }, f);
  const query = f.requests[0]!.searchParams;
  expect(query.has('profile.or')).toBe(false);
  expect(query.get('select')).not.toContain('!inner');
  expect(result.data[0]).toEqual({ ...publicRow, email: profile.email });
  expect(result.data[1]?.email).toBeNull();
  expect(result.data[2]?.display_name).toBe('Private name');
  expect(Object.keys(result.data[2]!).sort()).toEqual([
    'created_at',
    'display_name',
    'email',
    'handle',
    'id',
  ]);
});

it('keeps punctuation and wildcard characters literal in substring search', async () => {
  const f = fixture();
  await getInfrastructureUsers({ q: 'a,b("c")%_*\\d' }, f);
  const pattern = JSON.stringify('a,b\\("c"\\)%_\\*\\\\d');
  expect(f.requests[0]!.searchParams.get('private_match.or')).toBe(
    `(email.imatch.${pattern},full_name.imatch.${pattern})`
  );
  expect(f.requests[0]!.searchParams.get('or')).toBe(
    `(display_name.imatch.${pattern},handle.imatch.${pattern},private_match.not.is.null)`
  );
});

it.each([
  [{ page: '0', pageSize: '-1' }, '0', '10'],
  [{ page: '2junk', pageSize: '2junk' }, '0', '10'],
  [{ page: '2', pageSize: '1000' }, '100', '100'],
])(
  'bounds pagination without adding a search to blank input %j',
  async (params, offset, limit) => {
    const f = fixture();
    const result = await getInfrastructureUsers({ ...params, q: '  ' }, f);
    const query = f.requests[0]!.searchParams;
    expect(query.get('offset')).toBe(offset);
    expect(query.get('limit')).toBe(limit);
    expect(query.has('or')).toBe(false);
    expect(query.has('private_match.or')).toBe(false);
    expect(result).toEqual({ data: [], count: 0 });
  }
);

it('rejects unsafe page arithmetic without sending the query', async () => {
  const f = fixture();
  await expect(
    getInfrastructureUsers(
      { page: String(Number.MAX_SAFE_INTEGER), pageSize: '100' },
      f
    )
  ).rejects.toThrow('User page is out of range');
  expect(f.authorize).not.toHaveBeenCalled();
  expect(f.createAdminClient).not.toHaveBeenCalled();
  expect(f.fetchBoundary).not.toHaveBeenCalled();
});

it('preserves a failed query instead of showing an empty successful directory', async () => {
  const f = fixture([], 0, 400);
  await expect(
    getInfrastructureUsers({ q: 'synthetic' }, f)
  ).rejects.toMatchObject({ message: 'Synthetic query failure' });
});
