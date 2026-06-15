'use client';

import { Send } from '@tuturuuu/icons';
import type { TopicAnnouncementRecord } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DeliveryRecipients } from './topic-announcements-delivery-recipients';
import { TopicAnnouncementsEmptyState } from './topic-announcements-empty-state';
import { TopicAnnouncementsHelpTip } from './topic-announcements-help-tip';
import { formatTopicAnnouncementInstant } from './topic-announcements-scheduling';

interface Props {
  announcements: TopicAnnouncementRecord[];
  isLoading?: boolean;
  schedulingTimezone: string | null;
}

export function DeliveryPanel({
  announcements,
  isLoading = false,
  schedulingTimezone,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const params = useParams<{ wsId: string }>();
  const announcementsHref = `/${params?.wsId}/users/topic-announcements/announcements`;
  const delivered = announcements.filter(
    (announcement) => announcement.status === 'sent'
  );

  if (!isLoading && delivered.length === 0) {
    return (
      <TopicAnnouncementsEmptyState
        action={
          <Button asChild size="sm">
            <Link href={announcementsHref}>{t('delivery_compose_cta')}</Link>
          </Button>
        }
        description={t('delivery_empty_desc')}
        icon={<Send />}
        title={t('delivery_empty_title')}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('announcement_title')}</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                {t('recipients')}
                <TopicAnnouncementsHelpTip
                  label={t('delivery_relationship_help')}
                />
              </span>
            </TableHead>
            <TableHead>{t('sent_at')}</TableHead>
            <TableHead>{t('status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <TableRow key={`delivery-loading-${index}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-64" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-36" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                </TableRow>
              ))
            : null}
          {delivered.map((announcement) => (
            <TableRow key={announcement.id}>
              <TableCell className="font-medium">
                {announcement.title}
              </TableCell>
              <TableCell>
                <DeliveryRecipients
                  emails={announcement.contacts.map((contact) => contact.email)}
                />
              </TableCell>
              <TableCell>
                {formatTopicAnnouncementInstant(
                  announcement.sent_at,
                  schedulingTimezone ?? 'UTC'
                ) ?? t('not_sent')}
              </TableCell>
              <TableCell>
                <Badge className="gap-1" variant="success">
                  <Send className="h-3 w-3" />
                  {t('status_sent')}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
