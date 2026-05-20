'use client';

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
        title={t('nav_delivery')}
      />

      <DeliveryPanel
        announcements={deliveredAnnouncements}
        isLoading={isLoading.delivered}
        schedulingTimezone={schedulingTimezone}
      />
    </div>
  );
}
