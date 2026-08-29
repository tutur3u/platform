'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import {
  listWorkspaceBasicUsers,
  type WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { useMemo, useState } from 'react';
import { getDisplayName } from './tutoring-types';

const PAGE_SIZE = 20;

/**
 * Workspace people search backed by the paginated basic-users endpoint.
 *
 * The page used to page through *every* workspace user on mount to fill plain
 * `<Select>`s, which is O(members) requests before the first paint on a large
 * CRM workspace. Search server-side instead and only keep the current page in
 * memory.
 */
export function useWorkspacePeopleOptions({
  enabled = true,
  extraOptions,
  wsId,
}: {
  enabled?: boolean;
  extraOptions?: ComboboxOption[];
  wsId: string;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);

  const query = useInfiniteQuery({
    enabled,
    initialPageParam: 0,
    queryKey: ['tutoring-people', wsId, debouncedSearch],
    queryFn: ({ pageParam }) =>
      listWorkspaceBasicUsers(wsId, {
        from: pageParam,
        limit: PAGE_SIZE,
        q: debouncedSearch || undefined,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, page) => total + page.data.length,
        0
      );

      if (
        loadedCount >= (lastPage.count ?? 0) ||
        lastPage.data.length < PAGE_SIZE
      ) {
        return undefined;
      }

      return loadedCount;
    },
  });

  const people = useMemo(() => {
    const deduped = new Map<string, WorkspaceBasicUserRecord>();
    for (const page of query.data?.pages ?? []) {
      for (const person of page.data ?? []) {
        if (!deduped.has(person.id)) deduped.set(person.id, person);
      }
    }
    return [...deduped.values()];
  }, [query.data?.pages]);

  const options = useMemo(() => {
    const seen = new Set<string>();
    const result: ComboboxOption[] = [];

    for (const option of extraOptions ?? []) {
      if (seen.has(option.value)) continue;
      result.push(option);
      seen.add(option.value);
    }

    for (const person of people) {
      if (seen.has(person.id)) continue;
      result.push({
        description: person.email ?? undefined,
        label: getDisplayName(person),
        value: person.id,
      });
      seen.add(person.id);
    }

    return result;
  }, [extraOptions, people]);

  return {
    comboboxProps: {
      hasMore: Boolean(query.hasNextPage),
      loadingMore: query.isFetchingNextPage,
      onLoadMore: () => {
        if (query.hasNextPage) void query.fetchNextPage();
      },
      onSearchChange: setSearch,
      options,
    },
    people,
  };
}

export function WorkspacePersonPicker({
  className,
  disabled,
  emptyText,
  enabled,
  extraOptions,
  onChange,
  placeholder,
  searchPlaceholder,
  value,
  wsId,
}: {
  className?: string;
  disabled?: boolean;
  emptyText: string;
  enabled?: boolean;
  extraOptions?: ComboboxOption[];
  onChange: (value: string, option?: ComboboxOption) => void;
  placeholder: string;
  searchPlaceholder: string;
  value: string;
  wsId: string;
}) {
  const { comboboxProps } = useWorkspacePeopleOptions({
    enabled,
    extraOptions,
    wsId,
  });

  return (
    <Combobox
      {...comboboxProps}
      className={className}
      disabled={disabled}
      emptyText={emptyText}
      onChange={(next) => {
        const nextValue = next as string;
        onChange(
          nextValue,
          comboboxProps.options.find((option) => option.value === nextValue)
        );
      }}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      selected={value}
    />
  );
}
