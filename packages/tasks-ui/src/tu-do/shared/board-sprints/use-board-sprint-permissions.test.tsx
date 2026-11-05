import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardSprintPermissions } from './use-board-sprint-permissions';

const state = vi.hoisted(() => ({
  actor: null as {
    actorId: string;
    lifetime: { active: boolean };
    assertActive: () => void;
  } | null,
  check: vi.fn(),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => state.actor,
}));
vi.mock('@tuturuuu/internal-api/settings', () => ({
  checkWorkspacePermission: (...args: unknown[]) => state.check(...args),
}));

beforeEach(() => {
  state.check.mockReset();
  state.actor = {
    actorId: 'actor-a',
    lifetime: { active: true },
    assertActive: vi.fn(),
  };
});

function permissions(canEdit = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => useBoardSprintPermissions({ canEdit, wsId: 'ws-1' }),
    { wrapper }
  );
}

describe('useBoardSprintPermissions', () => {
  it('treats create and delete as independent explicit grants', async () => {
    state.check.mockImplementation(
      async (_wsId: string, permission: string) => ({
        hasPermission: permission === 'create_task_sprints',
        membershipType: 'MEMBER',
      })
    );
    const { result } = permissions();
    await waitFor(() => expect(result.current.canCreate).toBe(true));
    expect(result.current.canDelete).toBe(false);
    expect(state.check).toHaveBeenCalledWith('ws-1', 'create_task_sprints');
    expect(state.check).toHaveBeenCalledWith('ws-1', 'delete_task_sprints');
  });

  it('allows delete without implicitly granting create', async () => {
    state.check.mockImplementation(
      async (_wsId: string, permission: string) => ({
        hasPermission: permission === 'delete_task_sprints',
        membershipType: 'MEMBER',
      })
    );
    const { result } = permissions();
    await waitFor(() => expect(result.current.canDelete).toBe(true));
    expect(result.current.canCreate).toBe(false);
  });

  it('does not expose mutations while permission checks are loading', () => {
    state.check.mockImplementation(() => new Promise(() => {}));
    const { result } = permissions();
    expect(result.current).toEqual({ canCreate: false, canDelete: false });
  });

  it('denies a guest or non-member permission response without changing planning', async () => {
    state.check.mockResolvedValue({ hasPermission: false });
    const { result } = permissions();
    await waitFor(() => expect(state.check).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual({ canCreate: false, canDelete: false });
  });

  it.each(['GUEST', undefined])(
    'denies a grant without verified member type %s',
    async (membershipType) => {
      state.check.mockResolvedValue({ hasPermission: true, membershipType });
      const { result } = permissions();
      await waitFor(() => expect(state.check).toHaveBeenCalledTimes(2));
      expect(result.current).toEqual({ canCreate: false, canDelete: false });
    }
  );

  it('does not expose mutations after permission lookup errors', async () => {
    state.check.mockRejectedValue(new Error('permission service unavailable'));
    const { result } = permissions();
    await waitFor(() => expect(state.check).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual({ canCreate: false, canDelete: false });
  });

  it('does not ask for grants without a verified active actor or board editing', () => {
    state.actor = null;
    const missing = permissions();
    expect(missing.result.current).toEqual({
      canCreate: false,
      canDelete: false,
    });
    missing.unmount();
    state.actor = {
      actorId: 'actor-a',
      lifetime: { active: false },
      assertActive: vi.fn(),
    };
    const expired = permissions();
    expect(expired.result.current).toEqual({
      canCreate: false,
      canDelete: false,
    });
    expired.unmount();
    state.actor = {
      actorId: 'actor-a',
      lifetime: { active: true },
      assertActive: vi.fn(),
    };
    expect(permissions(false).result.current).toEqual({
      canCreate: false,
      canDelete: false,
    });
    expect(state.check).not.toHaveBeenCalled();
  });
});
