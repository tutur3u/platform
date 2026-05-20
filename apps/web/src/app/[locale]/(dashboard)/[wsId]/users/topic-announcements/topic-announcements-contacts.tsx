'use client';

import type {
  TopicAnnouncementContact,
  TopicAnnouncementContactPayload,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { useMemo } from 'react';
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
  wsId: string;
}

export function ContactsPanel({
  contacts,
  isCreating,
  isLoading,
  isVerifying,
  onCreate,
  onVerify,
  workspaceUsers,
  wsId,
}: Props) {
  const workspaceUsersById = useMemo(
    () => new Map(workspaceUsers.map((user) => [user.id, user])),
    [workspaceUsers]
  );

  return (
    <div className="space-y-4">
      <ContactForm
        isCreating={isCreating}
        onCreate={onCreate}
        workspaceUsers={workspaceUsers}
        wsId={wsId}
      />
      <ContactTable
        contacts={contacts}
        isLoading={isLoading}
        isVerifying={isVerifying}
        onVerify={onVerify}
        workspaceUsersById={workspaceUsersById}
      />
    </div>
  );
}
