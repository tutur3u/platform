'use client';

import { useQuery } from '@tanstack/react-query';
import {
  listTopicAnnouncementContacts,
  type TopicAnnouncementContact,
} from '@tuturuuu/internal-api';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  type ExistingContactRejection,
  resolveExistingContactSelection,
  sanitizeContactSearch,
} from './existing-contact-selection';

export const NEW_CONTACT = '__new__';
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_STALE_MS = 60_000;
const MAX_OPTIONS = 50;

/**
 * Search-backed picker over the workspace's existing announcement contacts.
 * Uses the workspace-scoped contacts lookup, which excludes archived contacts.
 */
export function ExistingContactPicker({
  disabled,
  onReject,
  onSelect,
  selected,
  wsId,
}: {
  disabled?: boolean;
  onReject: (reason: ExistingContactRejection) => void;
  onSelect: (contact: TopicAnnouncementContact | null) => void;
  selected: TopicAnnouncementContact | null;
  wsId: string;
}) {
  const t = useTranslations('ws-topic-announcements');
  const [search, setSearch] = useState('');
  const [debounced] = useDebounce(
    sanitizeContactSearch(search),
    SEARCH_DEBOUNCE_MS
  );
  const results = useQuery({
    queryFn: () =>
      listTopicAnnouncementContacts(wsId, { q: debounced || undefined }),
    queryKey: ['topic-announcement-existing-contact-search', wsId, debounced],
    select: (response) => response.data,
    staleTime: SEARCH_STALE_MS,
  });

  const candidates = useMemo(() => {
    const contacts = (results.data ?? []).slice(0, MAX_OPTIONS);
    if (selected && !contacts.some((contact) => contact.id === selected.id)) {
      contacts.unshift(selected);
    }
    return contacts;
  }, [results.data, selected]);

  const options = useMemo<ComboboxOption[]>(
    () => [
      { label: t('existing_contact_new'), muted: true, value: NEW_CONTACT },
      ...candidates.map((contact) => ({
        // Email is unique per workspace, so it disambiguates repeated names.
        description: contact.email || contact.id,
        label: contact.name || contact.email || contact.id,
        muted: contact.archived || !contact.email,
        searchValue: [contact.name, contact.email, contact.id]
          .filter(Boolean)
          .join(' '),
        value: contact.id,
      })),
    ],
    [candidates, t]
  );

  return (
    <Combobox
      disabled={disabled}
      emptyText={
        results.isFetching
          ? t('existing_contact_search_loading')
          : t('existing_contact_search_empty')
      }
      mode="single"
      onChange={(value) => {
        const contactId = typeof value === 'string' ? value : '';
        if (!contactId || contactId === NEW_CONTACT) {
          onSelect(null);
          return;
        }
        const resolved = resolveExistingContactSelection(candidates, contactId);
        if (resolved.ok) onSelect(resolved.contact);
        else onReject(resolved.reason);
      }}
      onSearchChange={setSearch}
      options={options}
      placeholder={t('existing_contact_placeholder')}
      searchPlaceholder={t('existing_contact_search_placeholder')}
      selected={selected?.id ?? NEW_CONTACT}
      shouldFilter={false}
    />
  );
}
