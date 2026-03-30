'use client';

import { useEffect, useMemo, useState } from 'react';
import { useInfiniteWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';
import {
  buildGroupComboboxOptions,
  hasSameGroupSelection,
  hasUnresolvedSelectedGroups,
  normalizeGroupSelection,
} from './group-selection-settings.utils';

interface UseHydratedWorkspaceGroupSelectionOptions {
  wsId: string;
  savedGroupIds?: string[];
  isConfigLoading?: boolean;
}

export function useHydratedWorkspaceGroupSelection({
  wsId,
  savedGroupIds = [],
  isConfigLoading = false,
}: UseHydratedWorkspaceGroupSelectionOptions) {
  const [searchQuery, setSearchQuery] = useState('');
  const [hasEditedSelection, setHasEditedSelection] = useState(false);
  const [initialSelection, setInitialSelection] = useState<string[]>([]);
  const [selection, setSelectionState] = useState<string[]>([]);

  const normalizedSavedGroupIds = useMemo(
    () => normalizeGroupSelection(savedGroupIds),
    [savedGroupIds]
  );

  useEffect(() => {
    if (isConfigLoading) {
      return;
    }

    setInitialSelection(normalizedSavedGroupIds);

    if (!hasEditedSelection) {
      setSelectionState(normalizedSavedGroupIds);
    }
  }, [hasEditedSelection, isConfigLoading, normalizedSavedGroupIds]);

  const groupsQuery = useInfiniteWorkspaceUserGroups(wsId, {
    query: searchQuery,
    ensureGroupIds: selection,
  });

  const options = useMemo(
    () => buildGroupComboboxOptions(groupsQuery.data ?? [], selection),
    [groupsQuery.data, selection]
  );

  return {
    selection,
    setSelection(nextSelection: string[]) {
      setHasEditedSelection(true);
      setSelectionState(normalizeGroupSelection(nextSelection));
    },
    initialSelection,
    isDirty: !hasSameGroupSelection(selection, initialSelection),
    isInitializing: isConfigLoading,
    searchQuery,
    setSearchQuery,
    options,
    hasUnresolvedSelectedGroups: hasUnresolvedSelectedGroups(
      selection,
      options
    ),
    isLoadingOptions: groupsQuery.isLoading,
    hasNextPage: groupsQuery.hasNextPage,
    fetchNextPage: groupsQuery.fetchNextPage,
    isFetchingNextPage: groupsQuery.isFetchingNextPage,
  };
}
