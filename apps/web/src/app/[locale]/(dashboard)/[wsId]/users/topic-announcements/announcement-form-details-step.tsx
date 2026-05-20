'use client';

import type { TopicAnnouncementTemplateRecord } from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { AnnouncementFormValues } from './announcement-form-state';
import {
  NO_GROUP,
  NO_TEMPLATE,
  TIME_INTERVALS,
} from './topic-announcements-form-constants';

interface Props {
  form: AnnouncementFormValues;
  groups: UserGroup[];
  isDisabled: boolean;
  setForm: (
    updater: (current: AnnouncementFormValues) => AnnouncementFormValues
  ) => void;
  templates: TopicAnnouncementTemplateRecord[];
}

export function AnnouncementFormDetailsStep({
  form,
  groups,
  isDisabled,
  setForm,
  templates,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const groupOptions = useMemo<ComboboxOption[]>(
    () => [
      { label: t('none'), muted: true, value: NO_GROUP },
      ...groups.map((group) => ({
        label: group.name || group.id,
        value: group.id,
      })),
    ],
    [groups, t]
  );
  const templateOptions = useMemo<ComboboxOption[]>(
    () => [
      { label: t('template_none'), muted: true, value: NO_TEMPLATE },
      ...templates.map((template) => ({
        label: template.name,
        value: template.id,
      })),
    ],
    [templates, t]
  );

  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    setForm((current) => ({
      ...current,
      contactIds: template.default_contact_ids ?? [],
      endTime: template.end_time ?? '',
      groupId: template.group_id ?? NO_GROUP,
      place: template.place ?? '',
      room: template.room ?? '',
      selectedTemplateId: templateId,
      startTime: template.start_time ?? '',
      title: template.title,
      topic: template.topic ?? '',
    }));
  };

  return (
    <div className="space-y-4 rounded-md border bg-background p-4">
      <div>
        <h3 className="font-medium text-base">{t('announcement_metadata')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('announcement_metadata_helper')}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('template_apply_label')}</Label>
          <Combobox
            disabled={isDisabled}
            emptyText={t('templates_empty')}
            onChange={(value) => {
              const resolved = Array.isArray(value) ? value[0] : value;
              if (!resolved || resolved === NO_TEMPLATE) {
                setForm((current) => ({
                  ...current,
                  selectedTemplateId: NO_TEMPLATE,
                }));
                return;
              }
              applyTemplate(resolved);
            }}
            options={templateOptions}
            placeholder={t('template_apply_placeholder')}
            searchPlaceholder={t('template_search')}
            selected={form.selectedTemplateId}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="topic-title">{t('announcement_title')}</Label>
          <Input
            id="topic-title"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            placeholder={t('announcement_title_placeholder')}
            value={form.title}
          />
        </div>

        <div className="space-y-2">
          <Label>{t('classLabel')}</Label>
          <Combobox
            disabled={isDisabled}
            emptyText={t('no_user_groups')}
            onChange={(value) => {
              const resolved = Array.isArray(value) ? value[0] : value;
              setForm((current) => ({
                ...current,
                groupId: resolved || NO_GROUP,
              }));
            }}
            options={groupOptions}
            placeholder={t('linked_group_placeholder')}
            searchPlaceholder={t('search_user_groups')}
            selected={form.groupId}
          />
        </div>

        <TimeSelect
          label={t('startTime')}
          onChange={(value) =>
            setForm((current) => ({ ...current, startTime: value }))
          }
          value={form.startTime}
        />
        <TimeSelect
          label={t('endTime')}
          onChange={(value) =>
            setForm((current) => ({ ...current, endTime: value }))
          }
          value={form.endTime}
        />

        <div className="space-y-2">
          <Label htmlFor="topic-room">{t('room')}</Label>
          <Input
            id="topic-room"
            onChange={(event) =>
              setForm((current) => ({ ...current, room: event.target.value }))
            }
            value={form.room}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="topic-place">{t('place')}</Label>
          <Input
            id="topic-place"
            onChange={(event) =>
              setForm((current) => ({ ...current, place: event.target.value }))
            }
            value={form.place}
          />
        </div>
      </div>
    </div>
  );
}

function TimeSelect({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger>
          <SelectValue placeholder="--:--" />
        </SelectTrigger>
        <SelectContent>
          {TIME_INTERVALS.map((time) => (
            <SelectItem key={time} value={time}>
              {time}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
