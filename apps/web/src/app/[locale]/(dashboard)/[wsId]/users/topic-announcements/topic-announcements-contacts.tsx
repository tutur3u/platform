'use client';

import { ShieldCheck } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  TopicAnnouncementContactPayload,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { ContactForm } from './contact-form';
import { ContactTable } from './contact-table';

interface Props {
  contacts: TopicAnnouncementContact[];
  isCreating: boolean;
  isLoading: boolean;
  isVerifying: boolean;
  onCreate: (payload: TopicAnnouncementContactPayload) => void;
  onVerify: (contactId: string) => void;
  workspaceUsers: WorkspaceBasicUserRecord[];
}

export function ContactsPanel({
  contacts,
  isCreating,
  isLoading,
  isVerifying,
  onCreate,
  onVerify,
  workspaceUsers,
}: Props) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-dynamic-green/20 bg-dynamic-green/10 px-3 py-2 text-dynamic-green text-sm">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t('contacts_panel_note')}</p>
        </div>
      </div>
      <ContactForm
        isCreating={isCreating}
        onCreate={onCreate}
        workspaceUsers={workspaceUsers}
      />
      <ContactTable
        contacts={contacts}
        isLoading={isLoading}
        isVerifying={isVerifying}
        onVerify={onVerify}
      />
    </div>
  );
}
