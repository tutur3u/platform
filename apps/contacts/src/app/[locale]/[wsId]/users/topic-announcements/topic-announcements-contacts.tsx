'use client';

import type {
  TopicAnnouncementContact,
  TopicAnnouncementContactPayload,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { ContactForm } from './contact-form';
import { ContactTable } from './contact-table';

interface Props {
  contacts: TopicAnnouncementContact[];
  isAddDialogOpen: boolean;
  isCreating: boolean;
  isDeleting: boolean;
  isLoading: boolean;
  isVerifying: boolean;
  onAddDialogOpenChange: (open: boolean) => void;
  onCreate: (payload: TopicAnnouncementContactPayload) => void;
  onDelete: (contactId: string) => void;
  onVerify: (contactId: string) => void;
  workspaceUsers: WorkspaceBasicUserRecord[];
  wsId: string;
}

export function ContactsPanel({
  contacts,
  isAddDialogOpen,
  isCreating,
  isDeleting,
  isLoading,
  isVerifying,
  onAddDialogOpenChange,
  onCreate,
  onDelete,
  onVerify,
  workspaceUsers,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const workspaceUsersById = useMemo(
    () => new Map(workspaceUsers.map((user) => [user.id, user])),
    [workspaceUsers]
  );

  return (
    <div className="space-y-4">
      <Dialog open={isAddDialogOpen} onOpenChange={onAddDialogOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-background sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('contact_dialog_title')}</DialogTitle>
            <DialogDescription>{t('contact_dialog_helper')}</DialogDescription>
          </DialogHeader>
          <ContactForm
            isCreating={isCreating}
            onCreate={onCreate}
            workspaceUsers={workspaceUsers}
            wsId={wsId}
          />
        </DialogContent>
      </Dialog>

      <ContactTable
        contacts={contacts}
        isDeleting={isDeleting}
        isLoading={isLoading}
        isVerifying={isVerifying}
        onAddContact={() => onAddDialogOpenChange(true)}
        onDelete={onDelete}
        onVerify={onVerify}
        workspaceUsersById={workspaceUsersById}
      />
    </div>
  );
}
