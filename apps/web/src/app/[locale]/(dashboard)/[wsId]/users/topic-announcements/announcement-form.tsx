'use client';

import { Plus } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  TopicAnnouncementPayload,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { AnnouncementRecipientsPicker } from './announcement-recipients-picker';

const NO_GROUP = '__none__';

interface Props {
  contacts: TopicAnnouncementContact[];
  groups: UserGroup[];
  isCreating: boolean;
  onCreate: (payload: TopicAnnouncementPayload) => void;
}

export function AnnouncementForm({
  contacts,
  groups,
  isCreating,
  onCreate,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [form, setForm] = useState({
    classLabel: '',
    contactIds: [] as string[],
    groupId: NO_GROUP,
    place: '',
    room: '',
    startTime: '',
    title: '',
    topic: '',
  });

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

  const submit = () => {
    onCreate({
      classLabel: form.classLabel || null,
      contactIds: form.contactIds,
      groupId: form.groupId === NO_GROUP ? null : form.groupId,
      place: form.place || null,
      room: form.room || null,
      sourceType: 'manual',
      startTime: form.startTime || null,
      title: form.title,
      topic: form.topic,
    });
    setForm({
      classLabel: '',
      contactIds: [],
      groupId: NO_GROUP,
      place: '',
      room: '',
      startTime: '',
      title: '',
      topic: '',
    });
  };

  return (
    <div className="space-y-4 rounded-md border p-4">
      <AnnouncementFormHeader t={t} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="topic-title">{t('announcement_title')}</Label>
          <Input
            id="topic-title"
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>{t('linked_group')}</Label>
          <Combobox
            disabled={isCreating}
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
          <p className="text-muted-foreground text-xs">
            {t('linked_group_helper')}
          </p>
        </div>
        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor="topic-body">{t('topic')}</Label>
          <Textarea
            className="min-h-28"
            id="topic-body"
            value={form.topic}
            onChange={(event) =>
              setForm((current) => ({ ...current, topic: event.target.value }))
            }
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(['classLabel', 'room', 'startTime', 'place'] as const).map((key) => (
          <ScheduleField
            fieldKey={key}
            form={form}
            key={key}
            setForm={setForm}
            t={t}
          />
        ))}
      </div>

      <AnnouncementRecipientsPicker
        contacts={contacts}
        onChange={(contactIds) =>
          setForm((current) => ({ ...current, contactIds }))
        }
        selectedIds={form.contactIds}
      />

      <div className="flex justify-end">
        <Button
          className="gap-2"
          disabled={
            isCreating ||
            !form.title ||
            !form.topic ||
            form.contactIds.length === 0
          }
          onClick={submit}
        >
          <Plus className="h-4 w-4" />
          {t('create_announcement')}
        </Button>
      </div>
    </div>
  );
}

function AnnouncementFormHeader({
  t,
}: {
  t: ReturnType<typeof useTranslations<'ws-topic-announcements'>>;
}) {
  return (
    <div>
      <h2 className="font-medium text-base">{t('create_announcement')}</h2>
      <p className="text-muted-foreground text-sm">
        {t('create_announcement_helper')}
      </p>
    </div>
  );
}

function ScheduleField({
  fieldKey,
  form,
  setForm,
  t,
}: {
  fieldKey: 'classLabel' | 'place' | 'room' | 'startTime';
  form: Record<'classLabel' | 'place' | 'room' | 'startTime', string>;
  setForm: React.Dispatch<
    React.SetStateAction<{
      classLabel: string;
      contactIds: string[];
      groupId: string;
      place: string;
      room: string;
      startTime: string;
      title: string;
      topic: string;
    }>
  >;
  t: ReturnType<typeof useTranslations<'ws-topic-announcements'>>;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`topic-${fieldKey}`}>{t(fieldKey)}</Label>
      <Input
        id={`topic-${fieldKey}`}
        value={form[fieldKey]}
        onChange={(event) =>
          setForm((current) => ({
            ...current,
            [fieldKey]: event.target.value,
          }))
        }
      />
    </div>
  );
}
