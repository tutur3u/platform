import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  metadata: vi.fn(),
  translations: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: mocks.translations }));
// Mock the current server authorization seam, not the superseded root guard.
// Its real membership/permission behavior is covered by page-access.test.ts.
vi.mock('@/lib/desktop-deployment/page-access', () => ({
  getDesktopPageAccess: mocks.guard,
}));
vi.mock('./desktop-vault-client', () => ({
  DesktopVaultClient: ({ actorId }: { actorId: string }) => (
    <div data-testid="desktop-vault" data-actor-id={actorId} />
  ),
}));
vi.mock('@/lib/desktop-deployment/status.server', () => ({
  getDesktopDeploymentStatus: mocks.metadata,
}));

import Page from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ actorId: 'actor', canManage: false });
  mocks.translations.mockResolvedValue((key: string) => key);
  mocks.metadata.mockResolvedValue({
    run: null,
    packages: [],
    jobs: [],
    releasesAvailable: false,
    jobsAvailable: false,
  });
});
describe('desktop operator access', () => {
  it('checks root workspace before reading provider metadata', async () => {
    mocks.guard.mockRejectedValue(new Error('denied'));
    await expect(
      Page({ params: Promise.resolve({ wsId: 'other' }) })
    ).rejects.toThrow('denied');
    expect(mocks.guard).toHaveBeenCalledWith('other');
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it('loads public status after access is allowed', async () => {
    render(await Page({ params: Promise.resolve({ wsId: 'root' }) }));
    expect(screen.getByRole('heading', { name: 'title' })).toBeVisible();
    expect(screen.queryByTestId('desktop-vault')).not.toBeInTheDocument();
    expect(mocks.metadata).toHaveBeenCalledTimes(1);
    expect(mocks.guard.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.metadata.mock.invocationCallOrder[0]!
    );
  });
  it('passes the admitted account to manager controls without resolving another actor', async () => {
    mocks.guard.mockResolvedValue({
      actorId: 'manager-account',
      canManage: true,
    });
    render(await Page({ params: Promise.resolve({ wsId: 'root' }) }));
    expect(screen.getByTestId('desktop-vault')).toHaveAttribute(
      'data-actor-id',
      'manager-account'
    );
    expect(mocks.guard).toHaveBeenCalledExactlyOnceWith('root');
    expect(mocks.metadata).toHaveBeenCalledOnce();
  });
});
