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
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
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
    classLabel: '',
    contactIds: [] as string[],
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
      classLabel: template.class_label ?? '',
      contactIds: template.default_contact_ids ?? [],
      groupId: template.group_id ?? NO_GROUP,
      place: template.place ?? '',
      room: template.room ?? '',
      selectedTemplateId: templateId,
      startTime: template.start_time ?? '',
      title: template.title,
      topic: '',
    }));
    topicRef.current?.focus();
  };

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
      selectedTemplateId: NO_TEMPLATE,
      startTime: '',
      title: '',
      topic: '',
    });
  };

  return (
    <div className="space-y-5 rounded-md border bg-foreground/5 p-4">
      <AnnouncementFormHeader t={t} />

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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="topic-title">{t('announcement_title')}</Label>
          <Input
            id="topic-title"
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            value={form.title}
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
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-dynamic-purple/20 bg-dynamic-purple/5 p-3">
        <Label htmlFor="topic-body">{t('topic_primary_label')}</Label>
        <Textarea
          className="min-h-32"
          id="topic-body"
          onChange={(event) =>
            setForm((current) => ({ ...current, topic: event.target.value }))
          }
          placeholder={t('topic_primary_placeholder')}
          ref={topicRef}
          value={form.topic}
        />
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
        workspaceUsers={workspaceUsers}
      />

      <div className="flex flex-wrap justify-end gap-2">
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

      <TemplateFormDialog
        groups={groups}
        initial={{
          classLabel: form.classLabel,
          defaultContactIds: form.contactIds,
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
            classLabel: payload.classLabel ?? '',
            defaultContactIds: payload.defaultContactIds ?? [],
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
  form: {
    classLabel: string;
    place: string;
    room: string;
    startTime: string;
  };
  setForm: React.Dispatch<
    React.SetStateAction<{
      classLabel: string;
      contactIds: string[];
      groupId: string;
      place: string;
      room: string;
      selectedTemplateId: string;
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
        onChange={(event) =>
          setForm((current) => ({
            ...current,
            [fieldKey]: event.target.value,
          }))
        }
        value={form[fieldKey]}
      />
    </div>
  );
}
