import type { SupabaseClient } from '@tuturuuu/supabase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleImportFenceError,
  verifiedGoogleImportToken,
} from './google-calendar-import-fence';

const WS = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const ID_A = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const ID_B = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';

type Row = { id: string; access_token: string };

// Serves keyset pages from `pages`, recording every filter it receives.
function client(pages: Row[][], error: unknown = null) {
  const filters: Array<[string, unknown]> = [];
  let call = 0;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    }),
    gt: vi.fn((column: string, value: unknown) => {
      filters.push([`gt.${column}`, value]);
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({
      data: error ? null : (pages[call++] ?? []),
      error,
    })),
  };
  return {
    db: { from: vi.fn(() => query) } as unknown as SupabaseClient,
    filters,
    query,
  };
}

let nextId = 0;
// Distinct, ascending ids, like a real keyset page.
function page(count: number, token = 'other'): Row[] {
  return Array.from({ length: count }, () => {
    nextId += 1;
    return {
      id: `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`,
      access_token: token,
    };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifiedGoogleImportToken', () => {
  it('matches the credential in process and never filters on it', async () => {
    const { db, filters } = client([
      [
        { id: ID_A, access_token: 'credential-a' },
        { id: ID_B, access_token: 'credential-b' },
      ],
    ]);
    expect(await verifiedGoogleImportToken(db, WS, 'credential-b')).toBe(ID_B);
    expect(filters).toEqual([
      ['ws_id', WS],
      ['provider', 'google'],
      ['is_active', true],
    ]);
    expect(JSON.stringify(filters)).not.toContain('credential');
  });

  it('pages through large workspaces by id instead of failing', async () => {
    const first = page(199).concat([{ id: ID_A, access_token: 'other' }]);
    const { db, filters, query } = client([
      first,
      [{ id: ID_B, access_token: 'credential' }],
    ]);
    expect(await verifiedGoogleImportToken(db, WS, 'credential')).toBe(ID_B);
    expect(filters).toContainEqual(['gt.id', ID_A]);
    expect(query.order).toHaveBeenCalledWith('id', { ascending: true });
    expect(new Set(first.map((row) => row.id)).size).toBe(200);
    expect(JSON.stringify(filters)).not.toContain('credential');
  });

  it('accepts exactly the sanity bound', async () => {
    const pages = Array.from({ length: 50 }, () => page(200));
    pages[49]![199] = { id: ID_B, access_token: 'credential' };
    const { db } = client([...pages, []]);
    expect(await verifiedGoogleImportToken(db, WS, 'credential')).toBe(ID_B);
  });

  it('returns null when no row or several rows hold the credential', async () => {
    expect(
      await verifiedGoogleImportToken(
        client([[{ id: ID_A, access_token: 'other' }]]).db,
        WS,
        'credential'
      )
    ).toBeNull();
    expect(
      await verifiedGoogleImportToken(
        client([
          [
            { id: ID_A, access_token: 'credential' },
            { id: ID_B, access_token: 'credential' },
          ],
        ]).db,
        WS,
        'credential'
      )
    ).toBeNull();
  });

  it('fails closed on a read error', async () => {
    await expect(
      verifiedGoogleImportToken(client([], { code: '57014' }).db, WS, 'x')
    ).rejects.toBeInstanceOf(GoogleImportFenceError);
  });

  it('fails closed and warns only above the sanity bound', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = client(Array.from({ length: 51 }, () => page(200)));
    await expect(verifiedGoogleImportToken(db, WS, 'x')).rejects.toBeInstanceOf(
      GoogleImportFenceError
    );
    expect(warn).toHaveBeenCalledWith(
      'Google import token scan exceeded its bound',
      { wsId: WS, scanned: 10_200 }
    );
  });
});
