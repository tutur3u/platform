import { ResourceNotFound } from '@tuturuuu/payment/polar/server';
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
vi.mock('@tuturuuu/payment/polar/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/payment/polar/server')>()),
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
  it('returns not found for the SDK ResourceNotFound error', async () => {
    mocks.get.mockRejectedValueOnce(
      new ResourceNotFound(
        { error: 'ResourceNotFound', detail: 'Unknown checkout' },
        {
          response: new Response(null, { status: 404 }),
          request: new Request('https://api.polar.sh/v1/checkouts/unknown'),
          body: '',
        }
      )
    );
    await expect(render()).rejects.toThrow('NOT_FOUND');
  });
  it('preserves provider failures other than not found', async () => {
    const failure = new Error('Provider unavailable');
    mocks.get.mockRejectedValueOnce(failure);
    await expect(render()).rejects.toBe(failure);
  });
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
