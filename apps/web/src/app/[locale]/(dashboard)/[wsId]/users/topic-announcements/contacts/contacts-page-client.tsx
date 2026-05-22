'use client';

import { useTranslations } from 'next-intl';
import { ContactsPanel } from '../topic-announcements-contacts';
import { TopicAnnouncementsPageHeader } from '../topic-announcements-page-header';
import { useTopicAnnouncements } from '../topic-announcements-shell';

export function TopicAnnouncementsContactsPageClient() {
  const t = useTranslations('ws-topic-announcements');
  const { actions, contacts, isLoading, pending, workspaceUsers, wsId } =
    useTopicAnnouncements();

  return (
    <div className="space-y-4">
      <TopicAnnouncementsPageHeader
        description={t('contacts_page_description')}
        title={t('nav_contacts')}
      />

      <ContactsPanel
        contacts={contacts}
        isCreating={pending.createContact}
        isDeleting={pending.deleteContact}
        isLoading={isLoading.contacts}
        isVerifying={pending.verify}
        onCreate={actions.createContact}
        onDelete={actions.deleteContact}
        onVerify={actions.verify}
        workspaceUsers={workspaceUsers}
        wsId={wsId}
      />
    </div>
  );
}
