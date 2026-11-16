'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown, UserRound } from '@tuturuuu/icons';
import {
  searchWorkspacePeople,
  type WorkspacePerson,
} from '@tuturuuu/internal-api/people';
import { useDeferredValue, useState } from 'react';
import { Button } from '../button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../command';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';

export type WorkspacePeoplePickerLabels = {
  trigger: string;
  search: string;
  minimumQuery: string;
  loading: string;
  empty: string;
  error: string;
  retry: string;
  contact: string;
  member: string;
};

type PickerState =
  | { kind: 'idle' | 'loading' | 'error' | 'empty' }
  | { kind: 'results'; people: WorkspacePerson[] };

export function WorkspacePeoplePicker({
  workspaceId,
  onSelect,
  labels,
  excludedPeople = [],
  excludedEmails = [],
  emailRequired = false,
  memberOnly = false,
  disabled = false,
}: {
  workspaceId: string;
  onSelect: (person: WorkspacePerson) => void;
  labels: WorkspacePeoplePickerLabels;
  excludedPeople?: readonly Pick<WorkspacePerson, 'kind' | 'id'>[];
  excludedEmails?: readonly string[];
  emailRequired?: boolean;
  memberOnly?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const query = useDeferredValue(input.trim());
  const ready = query.length >= 2 && query.length <= 100;
  const search = useQuery({
    queryKey: ['workspace-people', 'minimal-v1', workspaceId, query],
    queryFn: () => searchWorkspacePeople(workspaceId, { query, limit: 10 }),
    enabled: open && !disabled && Boolean(workspaceId) && ready,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  const excluded = new Set(excludedPeople.map(personKey));
  const excludedAddresses = new Set(
    excludedEmails.map((email) => email.trim().toLowerCase())
  );
  const people = (search.data?.data ?? []).filter(
    (person) =>
      (!memberOnly || person.kind === 'member') &&
      !excluded.has(personKey(person)) &&
      (!emailRequired ||
        Boolean(
          person.email &&
          /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(person.email.trim())
        )) &&
      !excludedAddresses.has(person.email?.trim().toLowerCase() ?? '') &&
      Boolean(person.displayName || person.email)
  );
  const state: PickerState = !ready
    ? { kind: 'idle' }
    : query !== input.trim() || search.isFetching || search.isPending
      ? { kind: 'loading' }
      : search.isError
        ? { kind: 'error' }
        : people.length
          ? { kind: 'results', people }
          : { kind: 'empty' };

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setInput('');
  }

  return (
    <Popover open={open && !disabled} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !workspaceId}
          aria-label={labels.trigger}
          aria-haspopup="dialog"
          className="w-full justify-between gap-2"
        >
          <span className="truncate">{labels.trigger}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <Command shouldFilter={false} label={labels.search}>
          <CommandInput
            aria-label={labels.search}
            placeholder={labels.search}
            value={input}
            onValueChange={setInput}
            maxLength={100}
          />
          <CommandList aria-busy={state.kind === 'loading'}>
            {state.kind === 'results' ? (
              <CommandGroup>
                {state.people.map((person) => (
                  <CommandItem
                    key={personKey(person)}
                    value={personKey(person)}
                    onSelect={() => {
                      onSelect(person);
                      changeOpen(false);
                    }}
                  >
                    <UserRound aria-hidden="true" className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {person.displayName || person.email}
                      </span>
                      {person.displayName && person.email ? (
                        <span className="block truncate text-muted-foreground text-xs">
                          {person.email}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {person.kind === 'contact' ? labels.contact : labels.member}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <div className="px-3 py-4 text-muted-foreground text-sm" role="status">
                {state.kind === 'idle'
                  ? labels.minimumQuery
                  : state.kind === 'loading'
                    ? labels.loading
                    : state.kind === 'empty'
                      ? labels.empty
                      : labels.error}
              </div>
            )}
          </CommandList>
          {state.kind === 'error' ? (
            <Button type="button" variant="ghost" onClick={() => void search.refetch()}>
              {labels.retry}
            </Button>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function personKey(person: Pick<WorkspacePerson, 'kind' | 'id'>) {
  return `${person.kind}:${person.id}`;
}
