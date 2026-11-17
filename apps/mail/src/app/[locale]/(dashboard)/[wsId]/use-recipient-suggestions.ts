'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listMailCorrespondents } from '@tuturuuu/internal-api';
import { searchWorkspacePeople } from '@tuturuuu/internal-api/people';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import {
  mergeRecipientSuggestions,
  type RecipientSuggestion,
} from './recipient-ranking';

const DEBOUNCE_MS = 150;
const MAX_QUERY_LENGTH = 100;
const PEOPLE_MIN_QUERY = 2;

export type RecipientSuggestionsState =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty'; query: string }
  | {
      kind: 'results';
      query: string;
      rows: RecipientSuggestion[];
      /** Rows still belong to an earlier query while the current one loads. */
      stale: boolean;
    };

/**
 * Recent correspondents of the composing mailbox (from one typed character)
 * merged with workspace members and contacts (from two characters).
 */
export function useRecipientSuggestions({
  workspaceId,
  mailboxId,
  input,
  open,
  excludedAddresses,
}: {
  workspaceId?: string;
  mailboxId?: string;
  input: string;
  open: boolean;
  excludedAddresses: readonly string[];
}): RecipientSuggestionsState {
  const trimmed = input.trim().slice(0, MAX_QUERY_LENGTH);
  const [query] = useDebounce(trimmed, DEBOUNCE_MS);
  const recentEnabled = open && Boolean(workspaceId && mailboxId);
  const peopleEnabled =
    open && Boolean(workspaceId) && query.length >= PEOPLE_MIN_QUERY;

  const recent = useQuery({
    queryKey: ['mail', workspaceId, 'correspondents', mailboxId, query],
    queryFn: () =>
      listMailCorrespondents(workspaceId!, mailboxId!, { query, limit: 8 }),
    enabled: recentEnabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
  const people = useQuery({
    queryKey: ['workspace-people', 'mail-recipients', workspaceId, query],
    queryFn: () => searchWorkspacePeople(workspaceId!, { query, limit: 8 }),
    enabled: peopleEnabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });

  if (!open || (!recentEnabled && !peopleEnabled)) return { kind: 'closed' };
  const rows = mergeRecipientSuggestions({
    recent: recentEnabled ? (recent.data?.data ?? []) : [],
    people: peopleEnabled ? (people.data?.data ?? []) : [],
    query,
    excludedAddresses,
  });
  if (rows.length)
    return {
      kind: 'results',
      query,
      rows,
      stale:
        query !== trimmed ||
        (recentEnabled && recent.isPlaceholderData) ||
        (peopleEnabled && people.isPlaceholderData),
    };

  const settling =
    query !== trimmed ||
    (recentEnabled && recent.isFetching) ||
    (peopleEnabled && people.isFetching);
  if (settling) return { kind: 'loading' };
  const failed =
    (recentEnabled && recent.isError) || (peopleEnabled && people.isError);
  if (failed && !(recent.isSuccess || people.isSuccess))
    return { kind: 'error' };
  return { kind: 'empty', query };
}
