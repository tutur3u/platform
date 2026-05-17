'use client';

import type {
  TopicAnnouncementContact,
  TopicAnnouncementContactPayload,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
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
  return (
    <div className="space-y-4">
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
