import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  rows: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({
      from: (table: string) => {
        f.from(table);
        return {
          select: () => ({
            eq: (column: string, value: string) => {
              f.eq(column, value);
              return {
                order: (column: string, options: unknown) => {
                  f.order(column, options);
                  return { limit: () => f.rows() };
                },
              };
            },
          }),
        };
      },
    }),
  }),
}));

import { readOpenMiraAcceptanceRevision } from './room-mira-evidence';

beforeEach(() => vi.resetAllMocks());

it('returns the latest revision while it has no end row', async () => {
  f.rows.mockResolvedValue({
    data: [
      { revision: 4, event: 'accept' },
      { revision: 3, event: 'end' },
    ],
    error: null,
  });
  expect(await readOpenMiraAcceptanceRevision('meeting')).toBe(4);
  expect(f.from).toHaveBeenCalledWith('meet_mira_host_acceptances');
  expect(f.eq).toHaveBeenCalledWith('meeting_id', 'meeting');
  expect(f.order).toHaveBeenCalledWith('revision', { ascending: false });
});

it('returns 0 once the latest revision has ended, or when there is none', async () => {
  f.rows.mockResolvedValue({
    data: [
      { revision: 4, event: 'end' },
      { revision: 4, event: 'accept' },
    ],
    error: null,
  });
  expect(await readOpenMiraAcceptanceRevision('meeting')).toBe(0);
  f.rows.mockResolvedValue({ data: [], error: null });
  expect(await readOpenMiraAcceptanceRevision('meeting')).toBe(0);
});

it('returns 0 when the lookup fails, so no Join state can apply', async () => {
  f.rows.mockResolvedValue({ data: null, error: new Error('down') });
  expect(await readOpenMiraAcceptanceRevision('meeting')).toBe(0);
  f.rows.mockRejectedValue(new Error('network'));
  expect(await readOpenMiraAcceptanceRevision('meeting')).toBe(0);
});
