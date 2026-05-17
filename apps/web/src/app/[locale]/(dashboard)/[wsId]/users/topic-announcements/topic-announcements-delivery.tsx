'use client';

import type { TopicAnnouncementRecord } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';

interface Props {
  announcements: TopicAnnouncementRecord[];
}

export function DeliveryPanel({ announcements }: Props) {
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
          {delivered.map((announcement) => (
            <TableRow key={announcement.id}>
              <TableCell>{announcement.title}</TableCell>
              <TableCell>
                {announcement.contacts
                  .map((contact) => contact.email)
                  .join(', ')}
              </TableCell>
              <TableCell>{announcement.sent_at ?? t('not_sent')}</TableCell>
              <TableCell>
                <Badge variant="success">{t('status_sent')}</Badge>
              </TableCell>
            </TableRow>
          ))}
          {delivered.length === 0 ? (
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
