'use client';

import { TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';

export function TopicAnnouncementsTabs() {
  const t = useTranslations('ws-topic-announcements');

  return (
    <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:w-auto sm:grid-cols-5">
      <TabsTrigger value="announcements">{t('tab_announcements')}</TabsTrigger>
      <TabsTrigger value="contacts">{t('tab_contacts')}</TabsTrigger>
      <TabsTrigger value="templates">{t('tab_templates')}</TabsTrigger>
      <TabsTrigger value="import">{t('tab_import')}</TabsTrigger>
      <TabsTrigger value="delivery">{t('tab_delivery')}</TabsTrigger>
    </TabsList>
  );
}
