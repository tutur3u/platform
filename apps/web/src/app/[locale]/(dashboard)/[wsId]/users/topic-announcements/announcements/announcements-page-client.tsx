'use client';

import { Megaphone } from '@tuturuuu/icons';
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
        eyebrow={t('nav_group_send')}
        title={t('nav_announcements')}
        actions={
          <div className="inline-flex items-center gap-2 rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-2 text-dynamic-blue text-sm">
            <Megaphone className="h-4 w-4" />
            {t('announcements_page_action')}
          </div>
        }
      />

      <AnnouncementsPanel
        announcements={announcements}
        canSend={canSend}
        contacts={contacts}
        groups={groups}
        isCreating={pending.createAnnouncement}
        isLoading={isLoading.announcements}
        isSavingTemplate={pending.createTemplate}
        isScheduling={pending.schedule || pending.cancelSchedule}
        isSending={pending.send}
        onCancelSchedule={actions.cancelSchedule}
        onCreate={actions.createAnnouncement}
        onPageChange={filters.setPage}
        onQueryChange={filters.setQuery}
        onSaveTemplate={actions.saveTemplateFromForm}
        onSchedule={actions.schedule}
        onSend={actions.send}
        onStatusChange={filters.setStatus}
        onTimezoneRequired={actions.requestTimezone}
        page={filters.page}
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
