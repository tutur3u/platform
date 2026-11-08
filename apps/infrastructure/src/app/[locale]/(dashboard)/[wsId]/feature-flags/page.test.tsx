import { featureFlagCatalog } from '@tuturuuu/feature-flags';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  buildModel: vi.fn(),
  enforceRoot: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  translations: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('next-intl/server', () => ({ getTranslations: mocks.translations }));
vi.mock('../enforce-infrastructure-root', () => ({
  enforceInfrastructureRootWorkspace: mocks.enforceRoot,
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: mocks.authorize,
}));
vi.mock('./read-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./read-model')>();
  mocks.buildModel.mockImplementation(actual.buildFeatureFlagDashboardModel);
  return { buildFeatureFlagDashboardModel: mocks.buildModel };
});

import Page from './page';

const params = (wsId: string) => ({ params: Promise.resolve({ wsId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enforceRoot.mockResolvedValue(undefined);
  mocks.authorize.mockResolvedValue({ ok: true, user: { id: 'admin' } });
  mocks.translations.mockResolvedValue((key: string) => key);
});

describe('feature flags page access', () => {
  it('stops non-root workspaces before authorizing or reading flags', async () => {
    mocks.enforceRoot.mockRejectedValue(new Error('NEXT_REDIRECT'));
    await expect(Page(params('other'))).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.enforceRoot).toHaveBeenCalledWith('other');
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.buildModel).not.toHaveBeenCalled();
  });

  it('hides the page from anonymous or non-admin members', async () => {
    for (const status of [401, 403]) {
      mocks.authorize.mockResolvedValueOnce({
        ok: false,
        response: new Response(null, { status }),
      });
      await expect(Page(params('root'))).rejects.toThrow('NEXT_NOT_FOUND');
    }
    expect(mocks.authorize).toHaveBeenCalledWith('view_infrastructure');
    expect(mocks.notFound).toHaveBeenCalledTimes(2);
    expect(mocks.buildModel).not.toHaveBeenCalled();
    expect(mocks.translations).not.toHaveBeenCalled();
  });

  it('renders every catalog flag once access is granted', async () => {
    const { container } = render(await Page(params('root')));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'title'
    );
    const keys = [...container.querySelectorAll('[data-flag-key]')].map((row) =>
      row.getAttribute('data-flag-key')
    );
    expect(keys).toEqual(featureFlagCatalog.flags.map((flag) => flag.key));
    expect(mocks.enforceRoot.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.authorize.mock.invocationCallOrder[0]!
    );
    expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.buildModel.mock.invocationCallOrder[0]!
    );
  });

  it('is reachable from the delivery navigation group', async () => {
    const { getNavigationLinks } = await import('../navigation');
    const links = await getNavigationLinks({ personalOrWsId: 'root' });
    const delivery = links.find(
      (link) =>
        link?.title === 'infrastructure-navigation.groups.delivery.title'
    );
    expect(delivery?.children?.map((link) => link?.href)).toContain(
      '/root/feature-flags'
    );
  });
});
