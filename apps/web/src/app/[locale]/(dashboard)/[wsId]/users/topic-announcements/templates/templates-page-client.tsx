'use client';

import { useTranslations } from 'next-intl';
import { TopicAnnouncementsPageHeader } from '../topic-announcements-page-header';
import { useTopicAnnouncements } from '../topic-announcements-shell';
import { TopicAnnouncementsTemplates } from '../topic-announcements-templates';

export function TopicAnnouncementsTemplatesPageClient() {
  const t = useTranslations('ws-topic-announcements');
  const { actions, groups, isLoading, pending, templates } =
    useTopicAnnouncements();

  return (
    <div className="space-y-4">
      <TopicAnnouncementsPageHeader
        description={t('templates_page_description')}
        title={t('nav_templates')}
      />

      <TopicAnnouncementsTemplates
        groups={groups}
        isDeleting={pending.deleteTemplate}
        isLoading={isLoading.templates}
        isSaving={pending.createTemplate || pending.updateTemplate}
        onCreate={actions.createTemplate}
        onDelete={actions.deleteTemplate}
        onUpdate={actions.updateTemplate}
        templates={templates}
      />
    </div>
  );
}
