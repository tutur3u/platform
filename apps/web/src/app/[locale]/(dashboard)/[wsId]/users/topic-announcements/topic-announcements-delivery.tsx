'use client';

import type { TopicAnnouncementRecord } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';
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
  const delivered = announcements.filter(
    (announcement) => announcement.status === 'sent'
  );

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('announcement_title')}</TableHead>
            <TableHead>{t('recipients')}</TableHead>
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
              <TableCell>{announcement.title}</TableCell>
              <TableCell>
                {announcement.contacts
                  .map((contact) => contact.email)
                  .join(', ')}
              </TableCell>
              <TableCell>
                {formatTopicAnnouncementInstant(
                  announcement.sent_at,
                  schedulingTimezone ?? 'UTC'
                ) ?? t('not_sent')}
              </TableCell>
              <TableCell>
                <Badge variant="success">{t('status_sent')}</Badge>
              </TableCell>
            </TableRow>
          ))}
          {!isLoading && delivered.length === 0 ? (
            <TableRow>
              <TableCell
                className="text-center text-muted-foreground"
                colSpan={4}
              >
                {t('no_delivery')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
