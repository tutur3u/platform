import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  workspace: vi.fn(),
  permission: vi.fn(),
  get: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatellitePageActor: mocks.actor,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: mocks.workspace,
}));
vi.mock('@tuturuuu/payment-core/billing-helper', () => ({
  checkManageSubscriptionPermission: mocks.permission,
}));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => ({ checkouts: { get: mocks.get } }),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock('./client-component', () => ({ default: () => null }));

import Page from './page';

const render = () =>
  Page({
    params: Promise.resolve({ wsId: 'workspace' }),
    searchParams: Promise.resolve({ checkoutId: 'checkout' }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ admin: {}, user: { id: 'user' } });
  mocks.workspace.mockResolvedValue({ id: 'workspace' });
  mocks.permission.mockResolvedValue(true);
  mocks.get.mockResolvedValue({
    id: 'checkout',
    status: 'succeeded',
    metadata: { wsId: 'workspace' },
    totalAmount: 0,
  });
});
describe('checkout confirmation access', () => {
  it('checks billing permission before reading provider data', async () => {
    mocks.permission.mockResolvedValue(false);
    await expect(render()).rejects.toThrow('NOT_FOUND');
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('rejects a checkout belonging to another workspace', async () => {
    mocks.get.mockResolvedValue({
      status: 'succeeded',
      metadata: { wsId: 'another-workspace' },
    });
    await expect(render()).rejects.toThrow('NOT_FOUND');
  });
  it.each(['open', 'confirmed', 'failed', 'expired'])(
    'does not claim success for %s checkout',
    async (status) => {
      mocks.get.mockResolvedValue({ status, metadata: { wsId: 'workspace' } });
      await expect(render()).rejects.toThrow(
        'REDIRECT:/workspace/billing#billing-history'
      );
    }
  );
  it('allows a succeeded fully discounted checkout', async () => {
    expect(await render()).toMatchObject({
      props: { wsId: 'workspace', checkout: { totalAmount: 0 } },
    });
  });
});
