'use client';

import { useQuery } from '@tanstack/react-query';
import { Megaphone } from '@tuturuuu/icons';
import {
  listTopicAnnouncements,
  type TopicAnnouncementRecord,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { DeliveryPanel } from './delivery-panel';

interface TopicAnnouncementsDeliveryListData {
  count: number;
  data: TopicAnnouncementRecord[];
  page: number;
  pageSize: number;
  totalPages: number;
}

interface TopicAnnouncementsDeliveryPageClientProps {
  initialAnnouncements: TopicAnnouncementsDeliveryListData;
  locale: string;
  schedulingTimezone: string | null;
  wsId: string;
}

export function TopicAnnouncementsDeliveryPageClient({
  initialAnnouncements,
  locale,
  schedulingTimezone,
  wsId,
}: TopicAnnouncementsDeliveryPageClientProps) {
  const t = useTranslations('ws-topic-announcements');
  const deliveredQueryKey = ['topic-announcements-delivered', wsId] as const;

  const deliveredQuery = useQuery({
    initialData: initialAnnouncements,
    queryFn: () =>
      listTopicAnnouncements(wsId, {
        page: 1,
        pageSize: 100,
        status: 'sent',
      }),
    queryKey: deliveredQueryKey,
    staleTime: 30_000,
  });

  const announcements = deliveredQuery.data.data;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <p className="max-w-3xl text-muted-foreground text-sm">
            {t('delivery_page_description')}
          </p>
        </div>

        <DeliveryPanel
          announcements={announcements}
          isLoading={deliveredQuery.isPending && announcements.length === 0}
          locale={locale}
          schedulingTimezone={schedulingTimezone}
          wsId={wsId}
        />
      </div>
    </div>
  );
}
