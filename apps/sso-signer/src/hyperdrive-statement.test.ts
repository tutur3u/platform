import { describe, expect, it, vi } from 'vite-plus/test';
import { CONFIRMATION_STATEMENT, hyperdriveQuery } from './hyperdrive-query';

// Capture what the Worker sends without a database: the statement text, its
// parameters and options are the contract Hyperdrive's cache rule reads.
const calls = vi.hoisted(() => ({
  unsafe: [] as unknown[][],
  options: [] as unknown[],
}));

vi.mock('postgres', () => ({
  default: (_url: string, options: unknown) => {
    calls.options.push(options);
    return {
      unsafe: async (...args: unknown[]) => {
        calls.unsafe.push(args);
        return [{ fields: null, read_at: new Date(), checked_at: new Date() }];
      },
      end: async () => {},
    };
  },
}));

/** The select list, split on top-level commas. */
function selectList(statement: string) {
  const body = statement.replace(/^\s*select\s+/iu, '');
  expect(body, 'one select with no FROM, WITH or second statement').not.toMatch(
    /\b(?:from|with|union)\b|;/iu
  );
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      items.push(current.trim());
      current = '';
    } else current += char;
  }
  items.push(current.trim());
  return items;
}

describe('Hyperdrive confirmation statement', () => {
  it('is uncacheable by construction', () => {
    const items = selectList(CONFIRMATION_STATEMENT);
    // Hyperdrive matches these built-ins in the query text and never caches
    // a query that calls one (NOW() is in its documented list).
    expect(items).toContain('now() as read_at');
    expect(items).toContain('clock_timestamp() as checked_at');
    expect(items[0]).toBe(
      'public.sso_signer_confirm_transaction($1::uuid, $2::uuid, $3::text) as fields'
    );
    expect(items).toHaveLength(3);
  });

  it('sends exactly that statement with the bound parameters, once', async () => {
    calls.unsafe.length = 0;
    calls.options.length = 0;
    const pending: Promise<unknown>[] = [];
    const query = hyperdriveQuery(
      { connectionString: 'postgres://sso_signer:unused@127.0.0.1:1/postgres' },
      (promise) => pending.push(promise)
    );
    const args = {
      transactionId: '00000000-0000-4000-8000-000000000001',
      clientId: '00000000-0000-4000-8000-000000000002',
      kid: 'saml-test-1',
    };
    expect(await query(args, new AbortController().signal)).toBeNull();
    await Promise.all(pending);
    expect(calls.unsafe).toEqual([
      [
        CONFIRMATION_STATEMENT,
        [args.transactionId, args.clientId, args.kid],
        { prepare: true },
      ],
    ]);
    expect(calls.options).toEqual([
      expect.objectContaining({ max: 1, fetch_types: false, prepare: true }),
    ]);
  });
});
