'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type NovaSubmissionUser,
  searchNovaSubmissionUsers,
} from '@tuturuuu/internal-api';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';

const MINIMUM_SEARCH_LENGTH = 2;

export function mergeSubmissionUserOptions(
  users: NovaSubmissionUser[],
  selected: NovaSubmissionUser | null
) {
  if (!selected || users.some((user) => user.id === selected.id)) return users;
  return [selected, ...users];
}

export function novaSubmissionUserSearchQueryKey(
  search: string,
  selectedUserId: string
) {
  return ['nova', 'submission-user-search', search, selectedUserId] as const;
}

export function NovaSubmissionUserSearch({
  onUserChange,
  selectedUserId,
}: {
  onUserChange: (userId: string) => void;
  selectedUserId: string;
}) {
  const t = useTranslations('nova.submission-page.filters');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [debouncedSearch] = useDebounce(search.trim(), 300);
  const searchEnabled = debouncedSearch.length >= MINIMUM_SEARCH_LENGTH;

  const { data, isFetching } = useQuery({
    enabled: Boolean(selectedUserId) || (open && searchEnabled),
    queryFn: () =>
      searchNovaSubmissionUsers({
        q: searchEnabled ? debouncedSearch : undefined,
        selectedUserId: selectedUserId || undefined,
      }),
    queryKey: novaSubmissionUserSearchQueryKey(debouncedSearch, selectedUserId),
    staleTime: 30_000,
  });

  const options = mergeSubmissionUserOptions(
    data?.data ?? [],
    data?.selected ?? null
  );
  const selectedOption = options.find((user) => user.id === selectedUserId);

  return (
    <div className="relative">
      <Input
        aria-label={t('search-users')}
        autoComplete="off"
        className="mb-2 h-8"
        onChange={(event) => {
          const value = event.target.value;
          setSearch(value);
          setOpen(true);
          if (!value) onUserChange('');
        }}
        onFocus={() => setOpen(true)}
        placeholder={selectedOption?.email ?? t('search-users')}
        ref={inputRef}
        value={search}
      />
      {open ? (
        <div
          className="absolute z-20 mt-1 max-h-50 w-full overflow-y-auto rounded-md border bg-background shadow-lg"
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          tabIndex={-1}
        >
          {options.map((user) => (
            <button
              className={`block w-full cursor-pointer px-4 py-2 text-left hover:bg-accent ${selectedUserId === user.id ? 'font-semibold' : ''}`}
              key={user.id}
              onMouseDown={() => {
                onUserChange(user.id);
                setOpen(false);
                setSearch(user.email ?? '');
                inputRef.current?.blur();
              }}
              type="button"
            >
              {user.email ?? user.display_name ?? user.id}
            </button>
          ))}
          {!isFetching && options.length === 0 ? (
            <div className="px-4 py-2 text-muted-foreground">
              {searchEnabled ? t('no-users-found') : t('search-users-hint')}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
