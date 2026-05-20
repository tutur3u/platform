'use client';

import { BookOpenCheck } from '@tuturuuu/icons';
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
        eyebrow={t('nav_group_setup')}
        title={t('nav_templates')}
        actions={
          <div className="inline-flex items-center gap-2 rounded-md border border-dynamic-green/20 bg-dynamic-green/10 px-3 py-2 text-dynamic-green text-sm">
            <BookOpenCheck className="h-4 w-4" />
            {t('templates_page_action')}
          </div>
        }
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
