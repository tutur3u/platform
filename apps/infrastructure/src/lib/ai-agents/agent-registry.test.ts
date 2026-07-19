import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRootSecretValue: vi.fn(),
}));

vi.mock('./workspace-secret-store', () => ({
  getRootSecretValue: (...args: Parameters<typeof mocks.getRootSecretValue>) =>
    mocks.getRootSecretValue(...args),
  readSecretRows: vi.fn(),
  replaceSecretRows: vi.fn(),
}));

import { isAiAgentZaloPersonalEnabled } from './agent-registry';

describe('personal Zalo feature access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables the integration for the internal root workspace by default', async () => {
    await expect(
      isAiAgentZaloPersonalEnabled(undefined, ROOT_WORKSPACE_ID)
    ).resolves.toBe(true);
    expect(mocks.getRootSecretValue).not.toHaveBeenCalled();
  });

  it('keeps non-root workspaces behind the explicit feature flag', async () => {
    mocks.getRootSecretValue.mockResolvedValueOnce(null);

    await expect(
      isAiAgentZaloPersonalEnabled(undefined, 'workspace-1')
    ).resolves.toBe(false);
  });

  it('allows the explicit feature flag for non-root workspaces', async () => {
    mocks.getRootSecretValue.mockResolvedValueOnce(' TRUE ');

    await expect(
      isAiAgentZaloPersonalEnabled(undefined, 'workspace-1')
    ).resolves.toBe(true);
  });
});
