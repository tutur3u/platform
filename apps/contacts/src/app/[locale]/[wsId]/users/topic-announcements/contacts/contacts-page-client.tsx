'use client';

import { MailCheck, Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ContactsPanel } from '../topic-announcements-contacts';
import { TopicAnnouncementsPageHeader } from '../topic-announcements-page-header';
import { useTopicAnnouncements } from '../topic-announcements-shell';
import { getContactsNeedingVerification } from '../topic-announcements-verification-requests';

export function TopicAnnouncementsContactsPageClient() {
  const t = useTranslations('ws-topic-announcements');
  const { actions, contacts, isLoading, pending, workspaceUsers, wsId } =
    useTopicAnnouncements();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const unverifiedContactIds = useMemo(
    () => getContactsNeedingVerification(contacts).map((contact) => contact.id),
    [contacts]
  );

  return (
    <div className="space-y-4">
      <TopicAnnouncementsPageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {unverifiedContactIds.length > 0 ? (
              <Button
                className="gap-2"
                disabled={pending.verifyMany}
                onClick={() => actions.verifyMany(unverifiedContactIds)}
                type="button"
                variant="outline"
              >
                <MailCheck className="h-4 w-4" />
                {t('verify_all_unverified', {
                  count: unverifiedContactIds.length.toString(),
                })}
              </Button>
            ) : null}
            <Button
              className="gap-2"
              onClick={() => setIsAddDialogOpen(true)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              {t('add_contact')}
            </Button>
          </div>
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
