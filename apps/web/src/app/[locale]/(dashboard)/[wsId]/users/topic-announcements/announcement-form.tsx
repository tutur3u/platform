'use client';

import { Plus } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  TopicAnnouncementPayload,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  contacts: TopicAnnouncementContact[];
  isCreating: boolean;
  onCreate: (payload: TopicAnnouncementPayload) => void;
}

export function AnnouncementForm({ contacts, isCreating, onCreate }: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [form, setForm] = useState({
    classLabel: '',
    contactIds: [] as string[],
    place: '',
    room: '',
    startTime: '',
    title: '',
    topic: '',
  });

  const submit = () => {
    onCreate({
      classLabel: form.classLabel || null,
      contactIds: form.contactIds,
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
      place: '',
      room: '',
      startTime: '',
      title: '',
      topic: '',
    });
  };

  return (
    <div className="grid gap-3 rounded-md border p-4 lg:grid-cols-6">
      <div className="space-y-2 lg:col-span-2">
        <Label htmlFor="topic-title">{t('announcement_title')}</Label>
        <Input
          id="topic-title"
          value={form.title}
          onChange={(event) =>
            setForm((current) => ({ ...current, title: event.target.value }))
          }
        />
      </div>
      <div className="space-y-2 lg:col-span-4">
        <Label htmlFor="topic-body">{t('topic')}</Label>
        <Textarea
          id="topic-body"
          value={form.topic}
          onChange={(event) =>
            setForm((current) => ({ ...current, topic: event.target.value }))
          }
        />
      </div>
      {(['classLabel', 'room', 'startTime', 'place'] as const).map((key) => (
        <div className="space-y-2" key={key}>
          <Label htmlFor={`topic-${key}`}>{t(key)}</Label>
          <Input
            id={`topic-${key}`}
            value={form[key]}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                [key]: event.target.value,
              }))
            }
          />
        </div>
      ))}
      <div className="space-y-2 lg:col-span-2">
        <Label>{t('recipients')}</Label>
        <div className="max-h-32 space-y-2 overflow-auto rounded-md border p-2">
          {contacts.map((contact) => (
            <label className="flex items-center gap-2 text-sm" key={contact.id}>
              <Checkbox
                checked={form.contactIds.includes(contact.id)}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    contactIds: checked
                      ? [...current.contactIds, contact.id]
                      : current.contactIds.filter((id) => id !== contact.id),
                  }))
                }
              />
              <span>{contact.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-end">
        <Button
          className="w-full gap-2"
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
