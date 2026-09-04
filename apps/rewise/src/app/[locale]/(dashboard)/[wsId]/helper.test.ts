import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANONICAL_WS_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSessionUser: vi.fn(),
  getWorkspace: vi.fn(),
  isCurrentUserAIWhitelisted: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: (fn: unknown) => fn,
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: (
    ...args: Parameters<typeof mocks.getSatelliteAppSessionUser>
  ) => mocks.getSatelliteAppSessionUser(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: (...args: Parameters<typeof mocks.getWorkspace>) =>
    mocks.getWorkspace(...args),
}));

vi.mock('@/lib/ai-whitelist', () => ({
  isCurrentUserAIWhitelisted: (
    ...args: Parameters<typeof mocks.isCurrentUserAIWhitelisted>
  ) => mocks.isCurrentUserAIWhitelisted(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

import { requireRewiseWorkspace } from './helper';

describe('Rewise canonical workspace resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue({
      email: 'user@example.com',
      id: 'user-1',
    });
    mocks.getWorkspace.mockResolvedValue({
      id: CANONICAL_WS_ID,
      joined: true,
    });
    mocks.isCurrentUserAIWhitelisted.mockResolvedValue(true);
  });

  it('resolves a route slug with the satellite actor and returns its canonical id', async () => {
    const result = await requireRewiseWorkspace('workspace-handle');

    expect(result.wsId).toBe(CANONICAL_WS_ID);
    expect(mocks.getWorkspace).toHaveBeenCalledWith('workspace-handle', {
      useAdmin: true,
      user: { email: 'user@example.com', id: 'user-1' },
    });
  });

  it('preserves the workspace membership gate', async () => {
    mocks.getWorkspace.mockResolvedValue({
      id: CANONICAL_WS_ID,
      joined: false,
    });
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });

    await expect(requireRewiseWorkspace('workspace-handle')).rejects.toThrow(
      'redirect:/'
    );
  });

  it('redirects a missing satellite user to login before workspace access', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });

    await expect(requireRewiseWorkspace('workspace-handle')).rejects.toThrow(
      'redirect:/login'
    );
    expect(mocks.isCurrentUserAIWhitelisted).not.toHaveBeenCalled();
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
  });

  it('redirects a session without an email to login', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue({ id: 'user-1' });
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });

    await expect(requireRewiseWorkspace('workspace-handle')).rejects.toThrow(
      'redirect:/login'
    );
    expect(mocks.isCurrentUserAIWhitelisted).not.toHaveBeenCalled();
  });

  it('redirects a non-whitelisted user before workspace access', async () => {
    mocks.isCurrentUserAIWhitelisted.mockResolvedValue(false);
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });

    await expect(requireRewiseWorkspace('workspace-handle')).rejects.toThrow(
      'redirect:/not-whitelisted'
    );
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
  });

  it('returns not found when the workspace does not exist', async () => {
    mocks.getWorkspace.mockResolvedValue(null);
    mocks.notFound.mockImplementation(() => {
      throw new Error('not-found');
    });

    await expect(requireRewiseWorkspace('missing')).rejects.toThrow(
      'not-found'
    );
  });
});
