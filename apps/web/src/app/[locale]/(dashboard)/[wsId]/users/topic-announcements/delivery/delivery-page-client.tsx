'use client';

import { Send } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { DeliveryPanel } from '../topic-announcements-delivery';
import { TopicAnnouncementsPageHeader } from '../topic-announcements-page-header';
import { useTopicAnnouncements } from '../topic-announcements-shell';

export function TopicAnnouncementsDeliveryPageClient() {
  const t = useTranslations('ws-topic-announcements');
  const { deliveredAnnouncements, isLoading, schedulingTimezone } =
    useTopicAnnouncements();

  return (
    <div className="space-y-4">
      <TopicAnnouncementsPageHeader
        description={t('delivery_page_description')}
        eyebrow={t('nav_group_send')}
        title={t('nav_delivery')}
        actions={
          <div className="inline-flex items-center gap-2 rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-2 text-dynamic-blue text-sm">
            <Send className="h-4 w-4" />
            {t('delivery_page_action')}
          </div>
        }
      />

      <DeliveryPanel
        announcements={deliveredAnnouncements}
        isLoading={isLoading.delivered}
        schedulingTimezone={schedulingTimezone}
      />
    </div>
  );
}
