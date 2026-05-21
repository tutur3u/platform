'use client';

import { useTranslations } from 'next-intl';
import { TopicAnnouncementsPageHeader } from '../topic-announcements-page-header';
import { AnnouncementsPanel } from '../topic-announcements-panels';
import { useTopicAnnouncements } from '../topic-announcements-shell';

export function TopicAnnouncementsAnnouncementsPageClient() {
  const t = useTranslations('ws-topic-announcements');
  const {
    actions,
    announcements,
    canSend,
    contacts,
    filters,
    groups,
    isLoading,
    pending,
    schedulingTimezone,
    templates,
    workspaceUsers,
  } = useTopicAnnouncements();

  return (
    <div className="space-y-4">
      <TopicAnnouncementsPageHeader
        description={t('announcements_page_description')}
        title={t('nav_announcements')}
      />

      <AnnouncementsPanel
        announcements={announcements}
        canSend={canSend}
        contacts={contacts}
        groups={groups}
        isCreating={pending.createAnnouncement}
        isDeleting={pending.deleteAnnouncement}
        isLoading={isLoading.announcements}
        isSavingTemplate={pending.createTemplate}
        isScheduling={pending.schedule || pending.cancelSchedule}
        isSending={pending.send}
        onCancelSchedule={actions.cancelSchedule}
        onCreate={actions.createAnnouncement}
        onCreateAndSchedule={actions.createAndSchedule}
        onCreateAndSend={actions.createAndSend}
        onDelete={actions.deleteAnnouncement}
        onPageChange={filters.setPage}
        onQueryChange={filters.setQuery}
        onSaveTemplate={actions.saveTemplateFromForm}
        onSchedule={actions.schedule}
        onSend={actions.send}
        onStatusChange={filters.setStatus}
        onTimezoneRequired={actions.requestTimezone}
        page={filters.page}
        pageSize={filters.pageSize}
        query={filters.query}
        schedulingTimezone={schedulingTimezone}
        status={filters.status}
        templates={templates}
        totalPages={filters.totalPages}
        workspaceUsers={workspaceUsers}
      />
    </div>
  );
}
