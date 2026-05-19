'use client';

import { Plus } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContactPayload,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { WorkspaceVirtualUserLinker } from './workspace-virtual-user-linker';

interface Props {
  isCreating: boolean;
  onCreate: (payload: TopicAnnouncementContactPayload) => void;
  workspaceUsers: WorkspaceBasicUserRecord[];
  wsId: string;
}

export function ContactForm({
  isCreating,
  onCreate,
  workspaceUsers,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [form, setForm] = useState({
    email: '',
    name: '',
    tags: '',
    workspaceUserId: null as string | null,
  });

  const submit = () => {
    onCreate({
      email: form.email,
      name: form.name,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      workspaceUserId: form.workspaceUserId,
    });
    setForm({
      email: '',
      name: '',
      tags: '',
      workspaceUserId: null,
    });
  };

  return (
    <div className="grid gap-4 rounded-md border p-4 lg:grid-cols-2">
      <div className="space-y-4">
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
      </div>
      <div className="flex flex-col gap-4">
        <LinkedUserField
          disabled={isCreating}
          form={form}
          setForm={setForm}
          t={t}
          workspaceUsers={workspaceUsers}
          wsId={wsId}
        />
        <Button
          className="mt-auto w-full gap-2"
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

function LinkedUserField({
  disabled,
  form,
  setForm,
  t,
  workspaceUsers,
  wsId,
}: {
  disabled: boolean;
  form: { workspaceUserId: string | null };
  setForm: React.Dispatch<
    React.SetStateAction<{
      email: string;
      name: string;
      tags: string;
      workspaceUserId: string | null;
    }>
  >;
  t: ReturnType<typeof useTranslations<'ws-topic-announcements'>>;
  workspaceUsers: WorkspaceBasicUserRecord[];
  wsId: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{t('linked_user')}</Label>
      <p className="text-muted-foreground text-xs">{t('linked_user_helper')}</p>
      <WorkspaceVirtualUserLinker
        disabled={disabled}
        onChange={(workspaceUserId) =>
          setForm((current) => ({ ...current, workspaceUserId }))
        }
        seedUsers={workspaceUsers}
        value={form.workspaceUserId}
        wsId={wsId}
      />
    </div>
  );
}
