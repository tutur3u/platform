'use client';

import type { WorkspaceBasicUserRecord } from '@tuturuuu/internal-api';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { getWorkspaceUserDisplayName } from './workspace-user-display';
import {
  useWorkspaceUser,
  useWorkspaceUserSearch,
} from './workspace-user-search';

/**
 * Search-backed picker for the workspace user who is the teacher in charge.
 * `noneValue` is the "no teacher" option. Shared by the composer and the
 * schedule import.
 */
export function TeacherUserPicker({
  disabled,
  noneValue,
  onChange,
  selected,
  wsId,
}: {
  disabled?: boolean;
  noneValue: string;
  onChange: (userId: string) => void;
  selected: string;
  wsId: string;
}) {
  const t = useTranslations('ws-topic-announcements');
  const [search, setSearch] = useState('');
  const results = useWorkspaceUserSearch(wsId, search);
  const selectedId = selected !== noneValue ? selected : null;
  const selectedInResults = results.data?.some(
    (user: WorkspaceBasicUserRecord) => user.id === selectedId
  );
  const selectedUser = useWorkspaceUser(
    wsId,
    selectedInResults ? null : selectedId
  );

  const options = useMemo<ComboboxOption[]>(() => {
    const users = [...(results.data ?? [])];
    if (selectedUser.data && !selectedInResults)
      users.unshift(selectedUser.data);
    return [
      { label: t('teacher_none'), muted: true, value: noneValue },
      ...users.map((user) => ({
        label: getWorkspaceUserDisplayName(user),
        searchValue: [user.full_name, user.display_name, user.email]
          .filter(Boolean)
          .join(' '),
        value: user.id,
      })),
    ];
  }, [noneValue, results.data, selectedInResults, selectedUser.data, t]);

  return (
    <Combobox
      disabled={disabled}
      emptyText={
        results.isFetching
          ? t('teacher_search_loading')
          : t('teacher_search_empty')
      }
      mode="single"
      onChange={(value) =>
        onChange(typeof value === 'string' && value ? value : noneValue)
      }
      onSearchChange={setSearch}
      options={options}
      placeholder={t('teacher_select_placeholder')}
      searchPlaceholder={t('teacher_search_placeholder')}
      selected={selected}
      shouldFilter={false}
    />
  );
}
