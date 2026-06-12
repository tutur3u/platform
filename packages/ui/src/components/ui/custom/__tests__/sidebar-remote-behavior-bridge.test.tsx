import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarRemoteBehaviorBridge } from '../sidebar-remote-behavior-bridge';

const { mockConfigState, mockUpdateConfigMutate } = vi.hoisted(() => ({
  mockConfigState: {
    remoteBehavior: 'expanded' as string | undefined,
    remoteLoaded: true,
  },
  mockUpdateConfigMutate: vi.fn(),
}));

vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUpdateUserConfig: () => ({
    mutate: mockUpdateConfigMutate,
  }),
  useUserConfig: () => ({
    data: mockConfigState.remoteBehavior,
    isSuccess: mockConfigState.remoteLoaded,
  }),
}));

function renderBridge({
  behavior = 'collapsed',
  behaviorUpdatedAt = null,
  localOverride = false,
  localOverrideVersion = 0,
  onApplyRemoteBehavior = vi.fn(),
  onRemoteBehaviorAvailable = vi.fn(),
  userChangeVersion = 0,
}: Partial<Parameters<typeof SidebarRemoteBehaviorBridge>[0]> = {}) {
  render(
    <SidebarRemoteBehaviorBridge
      behavior={behavior}
      behaviorUpdatedAt={behaviorUpdatedAt}
      localOverride={localOverride}
      localOverrideVersion={localOverrideVersion}
      onApplyRemoteBehavior={onApplyRemoteBehavior}
      onRemoteBehaviorAvailable={onRemoteBehaviorAvailable}
      userChangeVersion={userChangeVersion}
    />
  );

  return { onApplyRemoteBehavior, onRemoteBehaviorAvailable };
}

describe('SidebarRemoteBehaviorBridge', () => {
  beforeEach(() => {
    mockConfigState.remoteBehavior = 'expanded';
    mockConfigState.remoteLoaded = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a recent local behavior and persists it over stale remote behavior', async () => {
    const { onApplyRemoteBehavior } = renderBridge({
      behavior: 'collapsed',
      behaviorUpdatedAt: Date.now(),
    });

    await waitFor(() =>
      expect(mockUpdateConfigMutate).toHaveBeenCalledWith({
        configId: 'SIDEBAR_BEHAVIOR',
        value: 'collapsed',
      })
    );
    expect(onApplyRemoteBehavior).not.toHaveBeenCalled();
  });

  it('applies stale remote behavior when the local timestamp is stale', async () => {
    const { onApplyRemoteBehavior } = renderBridge({
      behavior: 'collapsed',
      behaviorUpdatedAt: Date.now() - 6 * 60 * 1000,
    });

    await waitFor(() =>
      expect(onApplyRemoteBehavior).toHaveBeenCalledWith('expanded')
    );
    expect(mockUpdateConfigMutate).not.toHaveBeenCalled();
  });

  it('applies stale remote behavior when there is no local timestamp', async () => {
    const { onApplyRemoteBehavior } = renderBridge({
      behavior: 'collapsed',
      behaviorUpdatedAt: null,
    });

    await waitFor(() =>
      expect(onApplyRemoteBehavior).toHaveBeenCalledWith('expanded')
    );
    expect(mockUpdateConfigMutate).not.toHaveBeenCalled();
  });

  it('does not apply remote behavior while local override is enabled', async () => {
    const { onApplyRemoteBehavior, onRemoteBehaviorAvailable } = renderBridge({
      behavior: 'collapsed',
      behaviorUpdatedAt: null,
      localOverride: true,
    });

    await waitFor(() =>
      expect(onRemoteBehaviorAvailable).toHaveBeenCalledWith('expanded')
    );
    expect(onApplyRemoteBehavior).not.toHaveBeenCalled();
    expect(mockUpdateConfigMutate).not.toHaveBeenCalled();
  });
});
