import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTutoringHandoff } from './use-tutoring-handoff';

const { mockActor } = vi.hoisted(() => ({
  mockActor: {
    current: {
      actorId: 'test-actor-1',
      assertActive: vi.fn(),
    } as { actorId: string; assertActive: () => void } | null,
  },
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => mockActor.current,
}));

describe('useTutoringHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor.current = {
      actorId: 'test-actor-1',
      assertActive: vi.fn(),
    };
  });

  it('provides scope with wsId, canManage, and actor', () => {
    const { result } = renderHook(() => useTutoringHandoff('ws-alpha', true));

    expect(result.current.scope).toEqual({
      wsId: 'ws-alpha',
      canManage: true,
      actor: mockActor.current,
    });
  });

  it('allows commit when handoff begins and remains active', () => {
    const { result } = renderHook(() => useTutoringHandoff('ws-alpha', true));

    let commit: (() => boolean) | undefined;
    act(() => {
      commit = result.current.begin();
    });

    expect(commit).toBeDefined();
    expect(commit!()).toBe(true);
    expect(mockActor.current?.assertActive).toHaveBeenCalled();
  });

  it('rejects commit if cancelled before commit is invoked', () => {
    const { result } = renderHook(() => useTutoringHandoff('ws-alpha', true));

    let commit: (() => boolean) | undefined;
    act(() => {
      commit = result.current.begin();
      result.current.cancel();
    });

    expect(commit!()).toBe(false);
  });

  it('invalidates prior begin when a new begin is started', () => {
    const { result } = renderHook(() => useTutoringHandoff('ws-alpha', true));

    let firstCommit: (() => boolean) | undefined;
    let secondCommit: (() => boolean) | undefined;

    act(() => {
      firstCommit = result.current.begin();
    });
    act(() => {
      secondCommit = result.current.begin();
    });

    expect(firstCommit!()).toBe(false);
    expect(secondCommit!()).toBe(true);
  });

  it('rejects commit if canManage is false', () => {
    const { result } = renderHook(() => useTutoringHandoff('ws-alpha', false));

    let commit: (() => boolean) | undefined;
    act(() => {
      commit = result.current.begin();
    });

    expect(commit!()).toBe(false);
  });

  it('returns false if actor.assertActive throws', () => {
    mockActor.current = {
      actorId: 'test-actor-inactive',
      assertActive: vi.fn(() => {
        throw new Error('Actor inactive');
      }),
    };

    const { result } = renderHook(() => useTutoringHandoff('ws-alpha', true));

    let commit: (() => boolean) | undefined;
    act(() => {
      commit = result.current.begin();
    });

    expect(commit!()).toBe(false);
  });

  it('returns false when unmounted before commit', () => {
    const { result, unmount } = renderHook(() =>
      useTutoringHandoff('ws-alpha', true)
    );

    let commit: (() => boolean) | undefined;
    act(() => {
      commit = result.current.begin();
    });

    unmount();
    expect(commit!()).toBe(false);
  });

  it('returns false if actor is missing initially', () => {
    mockActor.current = null;
    const { result } = renderHook(() => useTutoringHandoff('ws-alpha', true));

    let commit: (() => boolean) | undefined;
    act(() => {
      commit = result.current.begin();
    });

    expect(commit!()).toBe(false);
  });
});
