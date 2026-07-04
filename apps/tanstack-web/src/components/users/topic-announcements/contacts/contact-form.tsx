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
import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';
import { WorkspaceVirtualUserLinker } from './workspace-virtual-user-linker';

interface ContactFormProps {
  isCreating: boolean;
  onCreate: (payload: TopicAnnouncementContactPayload) => void;
  workspaceUsers: WorkspaceBasicUserRecord[];
  wsId: string;
}

interface ContactFormState {
  email: string;
  name: string;
  tags: string;
  workspaceUserId: string | null;
}

const EMPTY_FORM: ContactFormState = {
  email: '',
  name: '',
  tags: '',
  workspaceUserId: null,
};

export function ContactForm({
  isCreating,
  onCreate,
  workspaceUsers,
  wsId,
}: ContactFormProps) {
  const t = useTranslations('ws-topic-announcements');
  const [form, setForm] = useState<ContactFormState>(EMPTY_FORM);

  const submit = () => {
    onCreate({
      email: form.email.trim(),
      name: form.name.trim(),
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      workspaceUserId: form.workspaceUserId,
    });
    setForm(EMPTY_FORM);
  };

  return (
    <form
      className="grid gap-4 lg:grid-cols-2"
      id="topic-contact-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (isCreating || !form.name.trim() || !form.email.trim()) return;
        submit();
      }}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="topic-contact-name">{t('contact_name')}</Label>
          <Input
            id="topic-contact-name"
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            value={form.name}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="topic-contact-email">{t('email')}</Label>
          <Input
            id="topic-contact-email"
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
            type="email"
            value={form.email}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="topic-contact-tags">{t('tags')}</Label>
          <Input
            id="topic-contact-tags"
            onChange={(event) =>
              setForm((current) => ({ ...current, tags: event.target.value }))
            }
            placeholder={t('tags_placeholder')}
            value={form.tags}
          />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <LinkedUserField
          disabled={isCreating}
          form={form}
          setForm={setForm}
          workspaceUsers={workspaceUsers}
          wsId={wsId}
        />
        <Button
          className="mt-auto w-full gap-2"
          disabled={isCreating || !form.name.trim() || !form.email.trim()}
          type="submit"
        >
          <Plus className="h-4 w-4" />
          {t('add_contact')}
        </Button>
      </div>
    </form>
  );
}

function LinkedUserField({
  disabled,
  form,
  setForm,
  workspaceUsers,
  wsId,
}: {
  disabled: boolean;
  form: { workspaceUserId: string | null };
  setForm: Dispatch<SetStateAction<ContactFormState>>;
  workspaceUsers: WorkspaceBasicUserRecord[];
  wsId: string;
}) {
  const t = useTranslations('ws-topic-announcements');

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
