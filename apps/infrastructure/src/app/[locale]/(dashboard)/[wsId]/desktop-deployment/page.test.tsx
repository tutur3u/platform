import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  metadata: vi.fn(),
  translations: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: mocks.translations }));
vi.mock('../enforce-infrastructure-root', () => ({
  enforceInfrastructureRootWorkspace: mocks.guard,
}));
vi.mock('@/lib/desktop-deployment/status.server', () => ({
  getDesktopDeploymentStatus: mocks.metadata,
}));

import Page from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(undefined);
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
    expect(
      await Page({ params: Promise.resolve({ wsId: 'root' }) })
    ).toBeTruthy();
    expect(mocks.metadata).toHaveBeenCalledTimes(1);
    expect(mocks.guard.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.metadata.mock.invocationCallOrder[0]!
    );
  });
});
