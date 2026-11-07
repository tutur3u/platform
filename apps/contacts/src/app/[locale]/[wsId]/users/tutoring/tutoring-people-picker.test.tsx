// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspacePeopleOptions } from './tutoring-people-picker';

const { listWorkspaceBasicUsers, useInfiniteQuery } = vi.hoisted(() => ({
  listWorkspaceBasicUsers: vi.fn(),
  useInfiniteQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceBasicUsers,
}));

vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
}));

describe('useWorkspacePeopleOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInfiniteQuery.mockReturnValue({
      data: undefined,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
  });

  it('clears the server-side search filter when the picker closes', () => {
    const { result } = renderHook(() =>
      useWorkspacePeopleOptions({ wsId: 'workspace-1' })
    );

    act(() => result.current.comboboxProps.onSearchChange('Ada'));
    expect(useInfiniteQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ['tutoring-people', 'workspace-1', 'Ada'],
      })
    );

    act(() => result.current.comboboxProps.onOpenChange(true));
    expect(useInfiniteQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ['tutoring-people', 'workspace-1', 'Ada'],
      })
    );

    act(() => result.current.comboboxProps.onOpenChange(false));
    expect(useInfiniteQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ['tutoring-people', 'workspace-1', ''],
      })
    );
  });

  it('keeps the workspace-wide query when no group scope is given', async () => {
    renderHook(() => useWorkspacePeopleOptions({ wsId: 'workspace-1' }));
    const options = useInfiniteQuery.mock.lastCall?.[0];
    expect(options.queryKey).toEqual(['tutoring-people', 'workspace-1', '']);
    await options.queryFn({ pageParam: 0 });
    expect(listWorkspaceBasicUsers).toHaveBeenCalledWith('workspace-1', {
      from: 0,
      limit: 20,
      q: undefined,
    });
  });

  it('scopes the query and cache key to the given group', async () => {
    renderHook(() =>
      useWorkspacePeopleOptions({ groupId: 'group-a', wsId: 'workspace-1' })
    );
    const options = useInfiniteQuery.mock.lastCall?.[0];
    expect(options.queryKey).toEqual([
      'tutoring-people',
      'workspace-1',
      '',
      'group-a',
    ]);
    await options.queryFn({ pageParam: 20 });
    expect(listWorkspaceBasicUsers).toHaveBeenCalledWith('workspace-1', {
      from: 20,
      groupId: 'group-a',
      limit: 20,
      q: undefined,
    });
  });
});
