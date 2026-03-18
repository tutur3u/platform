import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockWorkspaceRedirectRequiredError extends Error {
    constructor(public readonly redirectTo: string) {
      super('Workspace redirect required');
    }
  }

  return {
    redirect: vi.fn(),
    enforceRootWorkspaceAdmin: vi.fn(),
    MockWorkspaceRedirectRequiredError,
  };
});

vi.mock('next/navigation', () => ({
  redirect: (...args: Parameters<typeof mocks.redirect>) =>
    mocks.redirect(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  enforceRootWorkspaceAdmin: (
    ...args: Parameters<typeof mocks.enforceRootWorkspaceAdmin>
  ) => mocks.enforceRootWorkspaceAdmin(...args),
  WorkspaceRedirectRequiredError: mocks.MockWorkspaceRedirectRequiredError,
}));

import { enforceInfrastructureRootWorkspace } from './enforce-infrastructure-root';

describe('enforceInfrastructureRootWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through when the workspace is already valid', async () => {
    mocks.enforceRootWorkspaceAdmin.mockResolvedValueOnce(undefined);

    await expect(
      enforceInfrastructureRootWorkspace('ws-1')
    ).resolves.toBeUndefined();

    expect(mocks.enforceRootWorkspaceAdmin).toHaveBeenCalledWith('ws-1', {
      redirectTo: '/ws-1/settings',
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('redirects when the root-workspace guard requests it', async () => {
    mocks.enforceRootWorkspaceAdmin.mockRejectedValueOnce(
      new mocks.MockWorkspaceRedirectRequiredError('/ws-1/settings')
    );

    await expect(
      enforceInfrastructureRootWorkspace('ws-1')
    ).resolves.toBeUndefined();

    expect(mocks.redirect).toHaveBeenCalledWith('/ws-1/settings');
  });

  it('rethrows unrelated errors', async () => {
    const error = new Error('boom');
    mocks.enforceRootWorkspaceAdmin.mockRejectedValueOnce(error);

    await expect(enforceInfrastructureRootWorkspace('ws-1')).rejects.toBe(
      error
    );
  });
});
