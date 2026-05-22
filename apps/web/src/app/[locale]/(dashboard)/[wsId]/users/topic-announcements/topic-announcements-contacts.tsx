'use client';

import { Plus } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  TopicAnnouncementContactPayload,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ContactForm } from './contact-form';
import { ContactTable } from './contact-table';

interface Props {
  contacts: TopicAnnouncementContact[];
  isCreating: boolean;
  isDeleting: boolean;
  isLoading: boolean;
  isVerifying: boolean;
  onCreate: (payload: TopicAnnouncementContactPayload) => void;
  onDelete: (contactId: string) => void;
  onVerify: (contactId: string) => void;
  workspaceUsers: WorkspaceBasicUserRecord[];
  wsId: string;
}

export function ContactsPanel({
  contacts,
  isCreating,
  isDeleting,
  isLoading,
  isVerifying,
  onCreate,
  onDelete,
  onVerify,
  workspaceUsers,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const workspaceUsersById = useMemo(
    () => new Map(workspaceUsers.map((user) => [user.id, user])),
    [workspaceUsers]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          className="gap-2"
          onClick={() => setIsAddDialogOpen(true)}
          type="button"
        >
          <Plus className="h-4 w-4" />
          {t('add_contact')}
        </Button>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
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
        onDelete={onDelete}
        onVerify={onVerify}
        workspaceUsersById={workspaceUsersById}
      />
    </div>
  );
}
