// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspacePeopleOptions } from './tutoring-people-picker';

const { useInfiniteQuery } = vi.hoisted(() => ({
  useInfiniteQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery,
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
});
