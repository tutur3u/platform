import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { upsertPostChecks } from './post-check-write';

const POST = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';

type StoredCheck = {
  post_id: string;
  user_id: string;
  is_completed: boolean;
  notes: string | null;
  approval_status: string;
  email_id: string | null;
  created_at: string;
};

function storeFixture(failWrite = 0) {
  const rows = new Map<string, StoredCheck>();
  const original = {
    post_id: POST,
    user_id: USER,
    is_completed: false,
    notes: 'Saved daily comment',
    approval_status: 'APPROVED',
    email_id: 'existing-email',
    created_at: '2026-10-12T00:00:00Z',
  };
  rows.set(USER, { ...original });
  const writes: Array<{ columns: string[]; prefer: string }> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    expect(url.pathname).toBe('/rest/v1/user_group_post_checks');
    if (init?.method === 'POST') {
      expect(headers.get('content-profile')).toBe('private');
      const values = JSON.parse(String(init.body)) as Array<
        Partial<StoredCheck>
      >;
      const columns = (url.searchParams.get('columns') ?? '')
        .split(',')
        .map((value) => value.replaceAll('"', ''));
      const prefer = headers.get('prefer') ?? '';
      expect(prefer).toContain('resolution=merge-duplicates');
      expect(url.searchParams.get('on_conflict')).toBe('post_id,user_id');
      writes.push({ columns, prefer });
      if (writes.length === failWrite) {
        return new Response(JSON.stringify({ message: 'Write rejected' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      for (const value of values) {
        if (!value.user_id) throw new Error('Missing fixture user ID');
        const previous = rows.get(value.user_id) ?? {
          ...original,
          user_id: value.user_id,
          notes: null,
          approval_status: 'PENDING',
          email_id: null,
        };
        // Model PostgREST's union-column batch: omitted values become NULL.
        const next = { ...previous };
        for (const column of columns) {
          Object.assign(next, { [column]: Reflect.get(value, column) ?? null });
        }
        rows.set(value.user_id, next);
      }
      return new Response(null, { status: 201 });
    }
    expect(headers.get('accept-profile')).toBe('private');
    return new Response(JSON.stringify([...rows.values()]), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetch, original, writes };
}

describe('post-check writes through the real Supabase client', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVER_URL', 'https://notes-fixture.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://notes-fixture.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'fixture-only-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('preserves saved notes and unrelated fields for completion-only writes', async () => {
    const fixture = storeFixture();
    const client = await createAdminClient({
      noCookie: true,
      fetch: fixture.fetch,
    });
    expect(
      await upsertPostChecks(client, [
        { post_id: POST, user_id: USER, is_completed: true },
      ])
    ).toEqual({ error: null });
    const { data } = await client
      .schema('private')
      .from('user_group_post_checks')
      .select('*');
    expect(data).toEqual([{ ...fixture.original, is_completed: true }]);
    expect(fixture.writes[0]?.columns).not.toContain('notes');
  });

  it('keeps mixed note edits separate from omitted notes and honors explicit clearing', async () => {
    const fixture = storeFixture();
    const client = await createAdminClient({
      noCookie: true,
      fetch: fixture.fetch,
    });
    await upsertPostChecks(client, [
      { post_id: POST, user_id: USER, is_completed: true },
      {
        post_id: POST,
        user_id: OTHER,
        is_completed: false,
        notes: 'New comment',
      },
    ]);
    let result = await client
      .schema('private')
      .from('user_group_post_checks')
      .select('*');
    expect(result.data?.find((row) => row.user_id === USER)?.notes).toBe(
      'Saved daily comment'
    );
    expect(result.data?.find((row) => row.user_id === OTHER)?.notes).toBe(
      'New comment'
    );
    expect(fixture.writes).toHaveLength(2);
    await upsertPostChecks(client, [
      { post_id: POST, user_id: USER, is_completed: true, notes: '' },
    ]);
    result = await client
      .schema('private')
      .from('user_group_post_checks')
      .select('*');
    expect(result.data?.find((row) => row.user_id === USER)?.notes).toBe('');
    await upsertPostChecks(client, [
      { post_id: POST, user_id: USER, is_completed: true, notes: null },
    ]);
    result = await client
      .schema('private')
      .from('user_group_post_checks')
      .select('*');
    expect(result.data?.find((row) => row.user_id === USER)?.notes).toBeNull();
  });

  it('returns an error when a later homogeneous batch fails', async () => {
    const fixture = storeFixture(2);
    const client = await createAdminClient({
      noCookie: true,
      fetch: fixture.fetch,
    });
    const { error } = await upsertPostChecks(client, [
      { post_id: POST, user_id: USER, is_completed: true },
      {
        post_id: POST,
        user_id: OTHER,
        is_completed: true,
        notes: 'New comment',
      },
    ]);
    expect(error?.message).toBe('Write rejected');
  });
});
