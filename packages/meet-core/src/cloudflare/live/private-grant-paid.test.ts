import { beforeEach, expect, it, vi } from 'vitest';
import type { LiveEnvironment } from './storage';

const f = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('./room', () => ({ liveRoomCommand: vi.fn() }));
vi.mock('./storage', () => ({
  liveAuthUser: vi.fn(),
  liveDatabase: f.database,
}));

import { readLivePaidAccount } from './private-grant';

const owner = '00000000-0000-4000-8000-000000000001';
const personal = '00000000-0000-4000-8000-000000000002';
const product = '00000000-0000-4000-8000-000000000003';
const enabled = { MEET_PAID_TIER_HOSTING_ENABLED: 'true' } as LiveEnvironment;

function fixture(tier: string | null) {
  f.database.mockImplementation((_env, path: string) => {
    if (path.startsWith('workspaces?')) return [{ id: personal }];
    if (path.startsWith('workspace_subscriptions?'))
      return [
        { created_at: '2026-11-01', status: 'active', product_id: product },
      ];
    return [{ id: product, tier }];
  });
}

beforeEach(() => vi.resetAllMocks());

it('requires the exact hosting switch before any subscription read', async () => {
  fixture('PRO');
  for (const value of [undefined, '', 'TRUE', '1'])
    expect(
      await readLivePaidAccount(
        { MEET_PAID_TIER_HOSTING_ENABLED: value } as LiveEnvironment,
        owner
      )
    ).toBe(false);
  expect(f.database).not.toHaveBeenCalled();
});

it('admits only paid Personal tiers and reads products from the private schema', async () => {
  fixture('PRO');
  expect(await readLivePaidAccount(enabled, owner)).toBe(true);
  expect(f.database).toHaveBeenLastCalledWith(
    enabled,
    expect.stringContaining('workspace_subscription_products?'),
    { schema: 'private' }
  );
  fixture('FREE');
  expect(await readLivePaidAccount(enabled, owner)).toBe(false);
});

it('fails closed for a missing Personal workspace or product tier', async () => {
  f.database.mockResolvedValueOnce([]);
  expect(await readLivePaidAccount(enabled, owner)).toBe(false);
  fixture(null);
  await expect(readLivePaidAccount(enabled, owner)).rejects.toThrow();
});
