'use client';

import type {
  TopicAnnouncementTemplatePayload,
  TopicAnnouncementTemplateRecord,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

const NO_GROUP = '__none__';

export interface TemplateFormValues {
  classLabel: string;
  defaultContactIds: string[];
  groupId: string;
  name: string;
  place: string;
  room: string;
  startTime: string;
  title: string;
  topic: string;
}

interface Props {
  groups: UserGroup[];
  initial?: TopicAnnouncementTemplateRecord | TemplateFormValues | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: TopicAnnouncementTemplatePayload) => void;
  titleKey:
    | 'template_create_title'
    | 'template_edit_title'
    | 'template_save_from_form_title';
}

export function TemplateFormDialog({
  groups,
  initial,
  isOpen,
  isSaving,
  onClose,
  onSave,
  titleKey,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [form, setForm] = useState<TemplateFormValues>({
    classLabel: '',
    defaultContactIds: [],
    groupId: NO_GROUP,
    name: '',
    place: '',
    room: '',
    startTime: '',
    title: '',
    topic: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    if (!initial) {
      setForm({
        classLabel: '',
        defaultContactIds: [],
        groupId: NO_GROUP,
        name: '',
        place: '',
        room: '',
        startTime: '',
        title: '',
        topic: '',
      });
      return;
    }

    if ('id' in initial) {
      setForm({
        classLabel: initial.class_label ?? '',
        defaultContactIds: initial.default_contact_ids ?? [],
        groupId: initial.group_id ?? NO_GROUP,
        name: initial.name,
        place: initial.place ?? '',
        room: initial.room ?? '',
        startTime: initial.start_time ?? '',
        title: initial.title,
        topic: initial.topic ?? '',
      });
      return;
    }

    setForm(initial);
  }, [initial, isOpen]);

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

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">{t('template_name')}</Label>
            <Input
              id="template-name"
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              value={form.name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-title">{t('announcement_title')}</Label>
            <Input
              id="template-title"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              value={form.title}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('linked_group')}</Label>
            <Combobox
              disabled={isSaving}
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
          <div className="space-y-2">
            <Label htmlFor="template-topic">
              {t('template_default_topic')}
            </Label>
            <Textarea
              className="min-h-20"
              id="template-topic"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  topic: event.target.value,
                }))
              }
              placeholder={t('template_default_topic_placeholder')}
              value={form.topic}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['classLabel', 'room', 'startTime', 'place'] as const).map(
              (key) => (
                <div className="space-y-2" key={key}>
                  <Label htmlFor={`template-${key}`}>{t(key)}</Label>
                  <Input
                    id={`template-${key}`}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    value={form[key]}
                  />
                </div>
              )
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t('template_cancel')}
          </Button>
          <Button
            disabled={isSaving || !form.name.trim() || !form.title.trim()}
            onClick={() =>
              onSave({
                classLabel: form.classLabel || null,
                defaultContactIds: form.defaultContactIds,
                groupId: form.groupId === NO_GROUP ? null : form.groupId,
                name: form.name.trim(),
                place: form.place || null,
                room: form.room || null,
                startTime: form.startTime || null,
                title: form.title.trim(),
                topic: form.topic,
              })
            }
            type="button"
          >
            {t('template_save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
