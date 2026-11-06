'use client';

import { Check, Plus } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  TopicAnnouncementContactPayload,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ExistingContactPicker } from './existing-contact-picker';
import type { ExistingContactRejection } from './existing-contact-selection';
import { WorkspaceVirtualUserLinker } from './workspace-virtual-user-linker';

interface Props {
  isCreating: boolean;
  onCreate: (payload: TopicAnnouncementContactPayload) => void;
  /** Called instead of `onCreate` when an existing contact was picked. */
  onSelectExisting?: (contact: TopicAnnouncementContact) => void;
  workspaceUsers: WorkspaceBasicUserRecord[];
  wsId: string;
}

const EMPTY_FORM = {
  email: '',
  name: '',
  tags: '',
  workspaceUserId: null as string | null,
};

export function ContactForm({
  isCreating,
  onCreate,
  onSelectExisting,
  workspaceUsers,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [form, setForm] = useState(EMPTY_FORM);
  const [existing, setExisting] = useState<TopicAnnouncementContact | null>(
    null
  );
  const [rejection, setRejection] = useState<ExistingContactRejection | null>(
    null
  );

  // An existing contact keeps its stored, workspace-bound values; the form
  // shows them read-only and never posts a new contact for it.
  const fields = existing
    ? {
        email: existing.email,
        name: existing.name,
        tags: existing.tags.join(', '),
        workspaceUserId: existing.workspaceUserId,
      }
    : form;
  const canSubmit = !isCreating && Boolean(fields.name && fields.email);

  const submit = () => {
    if (existing) {
      onSelectExisting?.(existing);
    } else {
      onCreate({
        email: form.email,
        name: form.name,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        workspaceUserId: form.workspaceUserId,
      });
    }
    setForm(EMPTY_FORM);
    setExisting(null);
  };

  return (
    <form
      className="grid gap-4 lg:grid-cols-2"
      id="topic-contact-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        submit();
      }}
    >
      <div className="space-y-2 lg:col-span-2">
        <Label>{t('existing_contact')}</Label>
        <p className="text-muted-foreground text-xs">
          {t('existing_contact_helper')}
        </p>
        <ExistingContactPicker
          disabled={isCreating}
          onReject={(reason) => {
            setExisting(null);
            setRejection(reason);
          }}
          onSelect={(contact) => {
            setExisting(contact);
            setRejection(null);
          }}
          selected={existing}
          wsId={wsId}
        />
        {rejection ? (
          <p className="text-dynamic-red text-xs" role="alert">
            {t(`existing_contact_rejected_${rejection}`)}
          </p>
        ) : null}
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="topic-contact-name">{t('contact_name')}</Label>
          <Input
            id="topic-contact-name"
            readOnly={Boolean(existing)}
            value={fields.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="topic-contact-email">{t('email')}</Label>
          <Input
            id="topic-contact-email"
            readOnly={Boolean(existing)}
            type="email"
            value={fields.email}
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
            readOnly={Boolean(existing)}
            value={fields.tags}
            onChange={(event) =>
              setForm((current) => ({ ...current, tags: event.target.value }))
            }
          />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <LinkedUserField
          disabled={isCreating || Boolean(existing)}
          onChange={(workspaceUserId) =>
            setForm((current) => ({ ...current, workspaceUserId }))
          }
          t={t}
          value={fields.workspaceUserId}
          workspaceUsers={workspaceUsers}
          wsId={wsId}
        />
        <Button
          className="mt-auto w-full gap-2"
          disabled={!canSubmit}
          type="submit"
        >
          {existing ? (
            <Check className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {existing ? t('use_existing_contact') : t('add_contact')}
        </Button>
      </div>
    </form>
  );
}

function LinkedUserField({
  disabled,
  onChange,
  t,
  value,
  workspaceUsers,
  wsId,
}: {
  disabled: boolean;
  onChange: (workspaceUserId: string | null) => void;
  t: ReturnType<typeof useTranslations<'ws-topic-announcements'>>;
  value: string | null;
  workspaceUsers: WorkspaceBasicUserRecord[];
  wsId: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{t('linked_user')}</Label>
      <p className="text-muted-foreground text-xs">{t('linked_user_helper')}</p>
      <WorkspaceVirtualUserLinker
        disabled={disabled}
        onChange={onChange}
        seedUsers={workspaceUsers}
        value={value}
        wsId={wsId}
      />
    </div>
  );
}
