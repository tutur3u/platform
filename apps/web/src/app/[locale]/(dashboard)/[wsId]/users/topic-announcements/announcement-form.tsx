'use client';

import { BookmarkPlus, Plus } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  TopicAnnouncementPayload,
  TopicAnnouncementTemplateRecord,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { AnnouncementRecipientsPicker } from './announcement-recipients-picker';
import {
  TemplateFormDialog,
  type TemplateFormValues,
} from './template-form-dialog';

const NO_GROUP = '__none__';
const NO_TEMPLATE = '__none__';

const TIME_INTERVALS = Array.from({ length: 96 }, (_, i) => {
  const hours = Math.floor(i / 4);
  const minutes = (i % 4) * 15;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
});

interface Props {
  contacts: TopicAnnouncementContact[];
  groups: UserGroup[];
  isCreating: boolean;
  isSavingTemplate: boolean;
  onCreate: (payload: TopicAnnouncementPayload) => void;
  onSaveTemplate: (values: TemplateFormValues) => void;
  templates: TopicAnnouncementTemplateRecord[];
  workspaceUsers: WorkspaceBasicUserRecord[];
}

export function AnnouncementForm({
  contacts,
  groups,
  isCreating,
  isSavingTemplate,
  onCreate,
  onSaveTemplate,
  templates,
  workspaceUsers,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const topicRef = useRef<HTMLTextAreaElement>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [form, setForm] = useState({
    contactIds: [] as string[],
    endTime: '',
    groupId: NO_GROUP,
    place: '',
    room: '',
    selectedTemplateId: NO_TEMPLATE,
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
    topicRef.current?.focus();
  };

  const submit = () => {
    onCreate({
      contactIds: form.contactIds,
      endTime: form.endTime || null,
      groupId: form.groupId === NO_GROUP ? null : form.groupId,
      place: form.place || null,
      room: form.room || null,
      sourceType: 'manual',
      startTime: form.startTime || null,
      title: form.title,
      topic: form.topic,
    });
    setForm({
      contactIds: [],
      endTime: '',
      groupId: NO_GROUP,
      place: '',
      room: '',
      selectedTemplateId: NO_TEMPLATE,
      startTime: '',
      title: '',
      topic: '',
    });
  };

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <AnnouncementFormHeader t={t} />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('template_apply_label')}</Label>
              <Combobox
                disabled={isCreating}
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
              <p className="text-muted-foreground text-xs">
                {t('template_apply_helper')}
              </p>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('startTime')}</Label>
                <Select
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, startTime: value }))
                  }
                  value={form.startTime}
                >
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
              <div className="space-y-2">
                <Label>{t('endTime')}</Label>
                <Select
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, endTime: value }))
                  }
                  value={form.endTime}
                >
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="topic-room">{t('room')}</Label>
                <Input
                  id="topic-room"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      room: event.target.value,
                    }))
                  }
                  value={form.room}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic-place">{t('place')}</Label>
                <Input
                  id="topic-place"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      place: event.target.value,
                    }))
                  }
                  value={form.place}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="topic-body">{t('topic_primary_label')}</Label>
              <Textarea
                className="min-h-[280px]"
                id="topic-body"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    topic: event.target.value,
                  }))
                }
                placeholder={t('topic_primary_placeholder')}
                ref={topicRef}
                value={form.topic}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Label className="text-base">{t('recipients')}</Label>
          <AnnouncementRecipientsPicker
            contacts={contacts}
            onChange={(contactIds) =>
              setForm((current) => ({ ...current, contactIds }))
            }
            selectedIds={form.contactIds}
            workspaceUsers={workspaceUsers}
          />
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t pt-6">
          <Button
            className="gap-2"
            disabled={isCreating || !form.title.trim()}
            onClick={() => setSaveTemplateOpen(true)}
            type="button"
            variant="outline"
          >
            <BookmarkPlus className="h-4 w-4" />
            {t('save_as_template')}
          </Button>
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
      </CardContent>

      <TemplateFormDialog
        groups={groups}
        initial={{
          defaultContactIds: form.contactIds,
          endTime: form.endTime,
          groupId: form.groupId,
          name: '',
          place: form.place,
          room: form.room,
          startTime: form.startTime,
          title: form.title,
          topic: form.topic,
        }}
        isOpen={saveTemplateOpen}
        isSaving={isSavingTemplate}
        onClose={() => setSaveTemplateOpen(false)}
        onSave={(payload) => {
          onSaveTemplate({
            defaultContactIds: payload.defaultContactIds ?? [],
            endTime: payload.endTime ?? '',
            groupId: payload.groupId ?? NO_GROUP,
            name: payload.name,
            place: payload.place ?? '',
            room: payload.room ?? '',
            startTime: payload.startTime ?? '',
            title: payload.title,
            topic: payload.topic ?? '',
          });
          setSaveTemplateOpen(false);
        }}
        titleKey="template_save_from_form_title"
      />
    </Card>
  );
}

function AnnouncementFormHeader({
  t,
}: {
  t: ReturnType<typeof useTranslations<'ws-topic-announcements'>>;
}) {
  return (
    <div>
      <h2 className="font-semibold text-xl tracking-tight">
        {t('create_announcement')}
      </h2>
      <p className="text-muted-foreground text-sm">
        {t('create_announcement_helper')}
      </p>
    </div>
  );
}
