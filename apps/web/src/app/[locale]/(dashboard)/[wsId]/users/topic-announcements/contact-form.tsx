'use client';

import { Plus } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContactPayload,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
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
import { useState } from 'react';

const NO_WORKSPACE_USER = '__none__';

function displayName(user: WorkspaceBasicUserRecord) {
  return user.display_name || user.full_name || user.email || user.id;
}

interface Props {
  isCreating: boolean;
  onCreate: (payload: TopicAnnouncementContactPayload) => void;
  workspaceUsers: WorkspaceBasicUserRecord[];
}

export function ContactForm({ isCreating, onCreate, workspaceUsers }: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [form, setForm] = useState({
    email: '',
    name: '',
    tags: '',
    workspaceUserId: NO_WORKSPACE_USER,
  });

  const submit = () => {
    onCreate({
      email: form.email,
      name: form.name,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      workspaceUserId:
        form.workspaceUserId === NO_WORKSPACE_USER
          ? null
          : form.workspaceUserId,
    });
    setForm({
      email: '',
      name: '',
      tags: '',
      workspaceUserId: NO_WORKSPACE_USER,
    });
  };

  return (
    <div className="grid gap-3 rounded-md border p-4 md:grid-cols-5">
      <div className="space-y-2">
        <Label htmlFor="topic-contact-name">{t('contact_name')}</Label>
        <Input
          id="topic-contact-name"
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="topic-contact-email">{t('email')}</Label>
        <Input
          id="topic-contact-email"
          type="email"
          value={form.email}
          onChange={(event) =>
            setForm((current) => ({ ...current, email: event.target.value }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="topic-contact-tags">{t('tags')}</Label>
        <Input
          id="topic-contact-tags"
          placeholder={t('tags_placeholder')}
          value={form.tags}
          onChange={(event) =>
            setForm((current) => ({ ...current, tags: event.target.value }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label>{t('linked_user')}</Label>
        <Select
          value={form.workspaceUserId}
          onValueChange={(value) =>
            setForm((current) => ({ ...current, workspaceUserId: value }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_WORKSPACE_USER}>{t('none')}</SelectItem>
            {workspaceUsers.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {displayName(user)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end">
        <Button
          className="w-full gap-2"
          disabled={isCreating || !form.name || !form.email}
          onClick={submit}
        >
          <Plus className="h-4 w-4" />
          {t('add_contact')}
        </Button>
      </div>
    </div>
  );
}
