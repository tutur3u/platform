import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extract: vi.fn(),
  from: vi.fn(),
  workspace: vi.fn(),
  subscriptions: vi.fn(),
  products: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: mocks.from,
    schema: () => ({ from: mocks.from }),
  }),
}));
vi.mock('./call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  extractTierFromSubscriptions: mocks.extract,
}));

import {
  getHostMeetingDurationSeconds,
  meetingDurationSeconds,
} from './meeting-duration';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.extract.mockReturnValue('PLUS');
  mocks.workspace.mockResolvedValue({
    data: { id: 'host-personal' },
    error: null,
  });
  mocks.subscriptions.mockResolvedValue({
    data: [
      {
        created_at: '2026-09-15T00:00:00Z',
        product_id: 'plus',
        status: 'active',
      },
    ],
    error: null,
  });
  mocks.products.mockResolvedValue({
    data: [{ id: 'plus', tier: 'PLUS' }],
    error: null,
  });
  mocks.from.mockImplementation((table: string) => {
    const run =
      table === 'workspaces'
        ? mocks.workspace
        : table === 'workspace_subscriptions'
          ? mocks.subscriptions
          : mocks.products;
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      or: vi.fn(),
      in: vi.fn(),
      maybeSingle: run,
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
      then: (
        resolve: (value: unknown) => unknown,
        reject: (error: unknown) => unknown
      ) => run().then(resolve, reject),
    };
    query.select.mockReturnValue(query);
    query.or.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.eq.mockImplementation((...args) => {
      mocks.eq(...args);
      return query;
    });
    return query;
  });
});
it.each([
  ['FREE', 2],
  ['PLUS', 10],
  ['PRO', 24],
  ['ENTERPRISE', 24],
] as const)('grants %s hosts %s hours', (tier, hours) => {
  expect(meetingDurationSeconds(tier as string)).toBe(Number(hours) * 3600);
});
it('resolves only the host personal account and canonical active product', async () => {
  expect(await getHostMeetingDurationSeconds('host')).toBe(36000);
  expect(mocks.eq).toHaveBeenCalledWith('creator_id', 'host');
  expect(mocks.eq).toHaveBeenCalledWith('personal', true);
  expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'host-personal');
});
it('does not silently downgrade paid hosts when subscription lookup fails', async () => {
  mocks.subscriptions.mockResolvedValue({
    data: null,
    error: { code: 'unavailable' },
  });
  await expect(getHostMeetingDurationSeconds('host')).rejects.toMatchObject({
    status: 503,
  });
});
