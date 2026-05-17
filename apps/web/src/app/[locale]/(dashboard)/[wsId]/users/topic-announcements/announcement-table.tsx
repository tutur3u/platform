'use client';

import { Send } from '@tuturuuu/icons';
import type { TopicAnnouncementRecord } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';

function canSendAnnouncement(announcement: TopicAnnouncementRecord) {
  return announcement.contacts.every((contact) =>
    ['verified', 'linked_confirmed_account'].includes(
      contact.verificationStatus
    )
  );
}

const STATUS_LABEL_KEYS = {
  cancelled: 'status_cancelled',
  draft: 'status_draft',
  failed: 'status_failed',
  queued: 'status_queued',
  sent: 'status_sent',
  skipped: 'status_skipped',
} as const;

interface Props {
  announcements: TopicAnnouncementRecord[];
  canSend: boolean;
  isLoading: boolean;
  isSending: boolean;
  onSend: (announcementId: string) => void;
}

export function AnnouncementTable({
  announcements,
  canSend,
  isLoading,
  isSending,
  onSend,
}: Props) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('announcement_title')}</TableHead>
            <TableHead>{t('recipients')}</TableHead>
            <TableHead>{t('schedule')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead className="text-right">{t('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {announcements.map((announcement) => (
            <TableRow key={announcement.id}>
              <TableCell>
                <div className="font-medium">{announcement.title}</div>
                <div className="line-clamp-2 text-muted-foreground text-sm">
                  {announcement.topic}
                </div>
              </TableCell>
              <TableCell>
                {announcement.contacts
                  .map((contact) => contact.name)
                  .join(', ')}
              </TableCell>
              <TableCell>
                {[
                  announcement.class_label,
                  announcement.start_time,
                  announcement.place,
                ]
                  .filter(Boolean)
                  .join(' / ')}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    announcement.status === 'sent' ? 'success' : 'outline'
                  }
                >
                  {t(STATUS_LABEL_KEYS[announcement.status])}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  className="gap-2"
                  disabled={
                    !canSend ||
                    isSending ||
                    announcement.status === 'sent' ||
                    !canSendAnnouncement(announcement)
                  }
                  onClick={() => onSend(announcement.id)}
                  size="sm"
                >
                  <Send className="h-4 w-4" />
                  {t('send')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!isLoading && announcements.length === 0 ? (
            <TableRow>
              <TableCell
                className="text-center text-muted-foreground"
                colSpan={5}
              >
                {t('no_announcements')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
