'use client';

import { useQuery } from '@tanstack/react-query';
import { listTopicAnnouncementCampusOptions } from '@tuturuuu/internal-api/topic-announcements';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

interface Props {
  disabled: boolean;
  onChange: (place: string) => void;
  value: string;
  wsId: string;
}

/**
 * The announcement place. Campuses from the workspace tutoring policy fill
 * the place with their label; the text input still takes any manual value.
 */
export function AnnouncementPlaceField({
  disabled,
  onChange,
  value,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const campusQuery = useQuery({
    queryFn: () => listTopicAnnouncementCampusOptions(wsId),
    queryKey: ['topic-announcement-campus-options', wsId],
    staleTime: 60_000,
  });
  const campuses = campusQuery.data?.data;
  const options = useMemo<ComboboxOption[]>(
    () => (campuses ?? []).map((label) => ({ label, value: label })),
    [campuses]
  );

  return (
    <div className="space-y-2">
      <Label htmlFor="topic-place">{t('place')}</Label>
      {options.length ? (
        <Combobox
          ariaLabel={t('place_campus_picker')}
          disabled={disabled}
          emptyText={t('place_campus_empty')}
          onChange={(selected) =>
            onChange(Array.isArray(selected) ? (selected[0] ?? '') : selected)
          }
          options={options}
          placeholder={t('place_campus_placeholder')}
          searchPlaceholder={t('place_campus_search')}
          selected={campuses?.includes(value) ? value : ''}
        />
      ) : null}
      <Input
        id="topic-place"
        onChange={(event) => onChange(event.target.value)}
        placeholder={options.length ? t('place_manual_placeholder') : undefined}
        value={value}
      />
    </div>
  );
}
