'use client';

import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ContactsPanel } from '../topic-announcements-contacts';
import { TopicAnnouncementsPageHeader } from '../topic-announcements-page-header';
import { useTopicAnnouncements } from '../topic-announcements-shell';

export function TopicAnnouncementsContactsPageClient() {
  const t = useTranslations('ws-topic-announcements');
  const { actions, contacts, isLoading, pending, workspaceUsers, wsId } =
    useTopicAnnouncements();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <TopicAnnouncementsPageHeader
        actions={
          <Button
            className="gap-2"
            onClick={() => setIsAddDialogOpen(true)}
            type="button"
          >
            <Plus className="h-4 w-4" />
            {t('add_contact')}
          </Button>
        }
        description={t('contacts_page_description')}
      />

      <ContactsPanel
        contacts={contacts}
        isAddDialogOpen={isAddDialogOpen}
        isCreating={pending.createContact}
        isDeleting={pending.deleteContact}
        isLoading={isLoading.contacts}
        isVerifying={pending.verify}
        onAddDialogOpenChange={setIsAddDialogOpen}
        onCreate={actions.createContact}
        onDelete={actions.deleteContact}
        onVerify={actions.verify}
        workspaceUsers={workspaceUsers}
        wsId={wsId}
      />
    </div>
  );
}
