import { describe, expect, it } from 'vitest';
import {
  type FullInvoiceData,
  type LegacyCreator,
  type PlatformCreator,
  type SearchInvoiceRpcResult,
  transformInvoiceData,
  transformInvoiceSearchResults,
} from '../finance/transform-invoice-results';

const platformCreator = (
  overrides: Partial<PlatformCreator> = {}
): PlatformCreator => ({
  id: 'platform-1',
  display_name: 'Platform Pat',
  avatar_url: 'https://example.test/platform.png',
  user_private_details: {
    full_name: 'Pat Platform',
    email: 'pat@example.test',
  },
  ...overrides,
});

const legacyCreator = (
  overrides: Partial<LegacyCreator> = {}
): LegacyCreator => ({
  id: 'legacy-1',
  display_name: 'Legacy Lee',
  full_name: 'Lee Legacy',
  email: 'lee@example.test',
  avatar_url: 'https://example.test/legacy.png',
  ...overrides,
});

const fullInvoice = (
  overrides: Partial<FullInvoiceData> = {}
): FullInvoiceData => ({
  id: 'inv-1',
  ws_id: 'ws-1',
  customer_id: 'cust-1',
  notice: 'notice',
  note: 'note',
  price: 100,
  total_diff: 0,
  created_at: '2025-01-01T00:00:00Z',
  creator_id: 'creator-1',
  customer: { full_name: 'Casey Customer', avatar_url: null },
  legacy_creator: null,
  platform_creator: null,
  wallet_transactions: null,
  ...overrides,
});

const searchRow = (
  overrides: Partial<SearchInvoiceRpcResult> = {}
): SearchInvoiceRpcResult => ({
  id: 'inv-1',
  ws_id: 'ws-1',
  customer_id: 'cust-1',
  price: 100,
  created_at: '2025-01-01T00:00:00Z',
  creator_id: 'creator-1',
  customer_full_name: 'Casey Customer',
  customer_avatar_url: 'https://example.test/casey.png',
  total_count: 7,
  ...overrides,
});

describe('transformInvoiceData creator resolution', () => {
  it.each<
    [
      string,
      Pick<FullInvoiceData, 'platform_creator' | 'legacy_creator'>,
      Record<string, unknown>,
    ]
  >([
    [
      'prefers the platform creator over the legacy creator',
      { platform_creator: platformCreator(), legacy_creator: legacyCreator() },
      {
        id: 'platform-1',
        display_name: 'Platform Pat',
        full_name: 'Pat Platform',
        email: 'pat@example.test',
        avatar_url: 'https://example.test/platform.png',
      },
    ],
    [
      'uses only the legacy creator when no platform creator exists',
      { platform_creator: null, legacy_creator: legacyCreator() },
      {
        id: 'legacy-1',
        display_name: 'Legacy Lee',
        full_name: 'Lee Legacy',
        email: 'lee@example.test',
        avatar_url: 'https://example.test/legacy.png',
      },
    ],
    [
      'falls back to the platform email when the platform display name is missing and no legacy creator exists',
      {
        platform_creator: platformCreator({ display_name: null }),
        legacy_creator: null,
      },
      {
        id: 'platform-1',
        display_name: 'pat@example.test',
        full_name: 'Pat Platform',
        email: 'pat@example.test',
        avatar_url: 'https://example.test/platform.png',
      },
    ],
    [
      'prefers the legacy display name over the platform email when the platform display name is missing',
      {
        platform_creator: platformCreator({ display_name: null }),
        legacy_creator: legacyCreator(),
      },
      {
        id: 'platform-1',
        display_name: 'Legacy Lee',
        full_name: 'Pat Platform',
        email: 'pat@example.test',
        avatar_url: 'https://example.test/platform.png',
      },
    ],
    [
      'fills missing platform private details from the legacy creator',
      {
        platform_creator: platformCreator({
          user_private_details: null,
          avatar_url: null,
        }),
        legacy_creator: legacyCreator(),
      },
      {
        id: 'platform-1',
        display_name: 'Platform Pat',
        full_name: 'Lee Legacy',
        email: 'lee@example.test',
        avatar_url: 'https://example.test/legacy.png',
      },
    ],
    [
      'returns an empty id and null fields when there is no creator at all',
      { platform_creator: null, legacy_creator: null },
      {
        id: '',
        display_name: null,
        full_name: null,
        email: null,
        avatar_url: null,
      },
    ],
    [
      'returns nulls for a legacy creator with only an id',
      { platform_creator: null, legacy_creator: { id: 'legacy-2' } },
      {
        id: 'legacy-2',
        display_name: null,
        full_name: null,
        email: null,
        avatar_url: null,
      },
    ],
  ])('%s', (_label, creators, expectedCreator) => {
    const [result] = transformInvoiceData([fullInvoice(creators)]);
    expect(result?.creator).toEqual(expectedCreator);
  });
});

describe('transformInvoiceData shaping', () => {
  it('returns an empty array for no input', () => {
    expect(transformInvoiceData([])).toEqual([]);
  });

  it.each<[string, FullInvoiceData['wallet_transactions'], unknown]>([
    ['no wallet transaction', null, null],
    ['a transaction without a wallet relation', { wallet_id: 'w1' }, null],
    [
      'a transaction with a null wallet',
      { wallet_id: 'w1', wallet: null },
      null,
    ],
    [
      'a transaction with a wallet',
      { wallet_id: 'w1', wallet: { name: 'Cash' } },
      { name: 'Cash' },
    ],
    [
      'a wallet without a name',
      { wallet_id: 'w1', wallet: { name: null } },
      { name: null },
    ],
  ])('normalizes the wallet for %s', (_label, walletTransactions, expected) => {
    const [result] = transformInvoiceData([
      fullInvoice({ wallet_transactions: walletTransactions }),
    ]);
    expect(result?.wallet).toEqual(expected);
  });

  it('keeps invoice fields and strips the raw relation fields', () => {
    const [result] = transformInvoiceData([
      fullInvoice({
        platform_creator: platformCreator(),
        wallet_transactions: { wallet: { name: 'Cash' } },
      }),
    ]);
    expect(result).toMatchObject({
      id: 'inv-1',
      ws_id: 'ws-1',
      customer_id: 'cust-1',
      price: 100,
      notice: 'notice',
      note: 'note',
      customer: { full_name: 'Casey Customer', avatar_url: null },
      wallet: { name: 'Cash' },
    });
    expect(result).not.toHaveProperty('legacy_creator');
    expect(result).not.toHaveProperty('platform_creator');
    expect(result).not.toHaveProperty('wallet_transactions');
  });

  it('preserves input order and transforms each row independently', () => {
    const results = transformInvoiceData([
      fullInvoice({ id: 'a', legacy_creator: legacyCreator() }),
      fullInvoice({ id: 'b', platform_creator: platformCreator() }),
      fullInvoice({ id: 'c' }),
    ]);
    expect(results.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(results.map((r) => r.creator.id)).toEqual([
      'legacy-1',
      'platform-1',
      '',
    ]);
  });

  it('does not mutate its input', () => {
    const input = [fullInvoice({ platform_creator: platformCreator() })];
    const snapshot = JSON.parse(JSON.stringify(input));
    transformInvoiceData(input);
    expect(input).toEqual(snapshot);
  });
});

describe('transformInvoiceSearchResults', () => {
  it('returns an empty array when there are no search results', () => {
    expect(transformInvoiceSearchResults([], [fullInvoice()])).toEqual([]);
  });

  it('builds the customer from the flattened RPC columns', () => {
    const [result] = transformInvoiceSearchResults([searchRow()], []);
    expect(result?.customer).toEqual({
      full_name: 'Casey Customer',
      avatar_url: 'https://example.test/casey.png',
    });
  });

  it('keeps RPC-only columns such as total_count on the result', () => {
    const [result] = transformInvoiceSearchResults([searchRow()], []);
    expect(result).toMatchObject({ id: 'inv-1', price: 100, total_count: 7 });
  });

  it('yields an empty creator and null wallet when no matching full invoice exists', () => {
    const [result] = transformInvoiceSearchResults(
      [searchRow({ id: 'missing' })],
      [fullInvoice({ id: 'other', platform_creator: platformCreator() })]
    );
    expect(result?.creator).toEqual({
      id: '',
      display_name: null,
      full_name: null,
      email: null,
      avatar_url: null,
    });
    expect(result?.wallet).toBeNull();
  });

  it('merges creator and wallet data from the matching full invoice by id', () => {
    const results = transformInvoiceSearchResults(
      [searchRow({ id: 'inv-2' }), searchRow({ id: 'inv-1' })],
      [
        fullInvoice({
          id: 'inv-1',
          legacy_creator: legacyCreator(),
          wallet_transactions: { wallet: { name: 'Cash' } },
        }),
        fullInvoice({
          id: 'inv-2',
          platform_creator: platformCreator(),
          wallet_transactions: { wallet: { name: 'Bank' } },
        }),
      ]
    );
    expect(results.map((r) => r.id)).toEqual(['inv-2', 'inv-1']);
    expect(results[0]?.creator.id).toBe('platform-1');
    expect(results[0]?.wallet).toEqual({ name: 'Bank' });
    expect(results[1]?.creator.id).toBe('legacy-1');
    expect(results[1]?.wallet).toEqual({ name: 'Cash' });
  });

  it('prefers the platform creator when the full invoice has both', () => {
    const [result] = transformInvoiceSearchResults(
      [searchRow()],
      [
        fullInvoice({
          platform_creator: platformCreator(),
          legacy_creator: legacyCreator(),
        }),
      ]
    );
    expect(result?.creator.id).toBe('platform-1');
    expect(result?.creator.full_name).toBe('Pat Platform');
  });

  it('tolerates a missing full invoice list', () => {
    const results = transformInvoiceSearchResults(
      [searchRow()],
      undefined as unknown as FullInvoiceData[]
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.creator.id).toBe('');
  });
});
