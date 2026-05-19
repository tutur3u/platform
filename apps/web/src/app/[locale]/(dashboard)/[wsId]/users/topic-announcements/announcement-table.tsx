'use client';

import { CalendarClock, MoreHorizontal, Send } from '@tuturuuu/icons';
import type { TopicAnnouncementRecord } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AnnouncementRecipientChip } from './announcement-recipient-chip';
import { AnnouncementScheduleDialog } from './announcement-schedule-dialog';
import { formatTopicAnnouncementInstant } from './topic-announcements-scheduling';

function canSendAnnouncement(announcement: TopicAnnouncementRecord) {
  return announcement.contacts.every((contact) =>
    ['verified', 'linked_confirmed_account'].includes(
      contact.verificationStatus
    )
  );
}

function countUnverifiedRecipients(announcement: TopicAnnouncementRecord) {
  return announcement.contacts.filter((contact) =>
    ['needs_verification', 'pending'].includes(contact.verificationStatus)
  ).length;
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
  isScheduling: boolean;
  isSending: boolean;
  onCancelSchedule: (announcementId: string) => void;
  onSchedule: (announcementId: string, scheduledSendAt: string) => void;
  onSend: (announcementId: string) => void;
  schedulingTimezone: string | null;
  onTimezoneRequired: () => void;
}

export function AnnouncementTable({
  announcements,
  canSend,
  isLoading,
  isScheduling,
  isSending,
  onCancelSchedule,
  onSchedule,
  onSend,
  schedulingTimezone,
  onTimezoneRequired,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [scheduleTarget, setScheduleTarget] =
    useState<TopicAnnouncementRecord | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('announcement_title')}</TableHead>
              <TableHead>{t('linked_group')}</TableHead>
              <TableHead>{t('recipients')}</TableHead>
              <TableHead>{t('class_schedule')}</TableHead>
              <TableHead>{t('send_at')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead className="text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {announcements.map((announcement) => {
              const unverifiedCount = countUnverifiedRecipients(announcement);
              const sendReady = canSendAnnouncement(announcement);
              const scheduledLabel = formatTopicAnnouncementInstant(
                announcement.scheduled_send_at,
                schedulingTimezone ?? 'UTC'
              );

              return (
                <TableRow key={announcement.id}>
                  <TableCell>
                    <div className="font-medium">{announcement.title}</div>
                    <div className="line-clamp-2 text-muted-foreground text-sm">
                      {announcement.topic}
                    </div>
                  </TableCell>
                  <TableCell>{announcement.group?.name ?? t('none')}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      {announcement.contacts.map((contact) => (
                        <AnnouncementRecipientChip
                          contact={contact}
                          key={contact.id}
                        />
                      ))}
                    </div>
                    {unverifiedCount > 0 ? (
                      <p className="mt-1 text-dynamic-orange text-xs">
                        {t('unverified_recipients', {
                          count: unverifiedCount.toString(),
                        })}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {[
                      announcement.class_label,
                      announcement.start_time,
                      announcement.place,
                    ]
                      .filter(Boolean)
                      .join(' / ') || t('none')}
                  </TableCell>
                  <TableCell>
                    {announcement.status === 'queued' && scheduledLabel ? (
                      <div className="flex items-center gap-1.5 text-sm">
                        <CalendarClock className="h-4 w-4 text-dynamic-blue" />
                        <span>{scheduledLabel}</span>
                      </div>
                    ) : announcement.sent_at ? (
                      formatTopicAnnouncementInstant(
                        announcement.sent_at,
                        schedulingTimezone ?? 'UTC'
                      )
                    ) : (
                      t('not_sent')
                    )}
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="outline">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={
                            !canSend ||
                            isSending ||
                            announcement.status === 'sent' ||
                            !sendReady
                          }
                          onClick={() => onSend(announcement.id)}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {t('send_now')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={
                            !canSend ||
                            isScheduling ||
                            ['sent', 'cancelled'].includes(announcement.status)
                          }
                          onClick={() => {
                            if (!schedulingTimezone) {
                              onTimezoneRequired();
                              return;
                            }
                            setScheduleTarget(announcement);
                          }}
                        >
                          <CalendarClock className="mr-2 h-4 w-4" />
                          {t('schedule_send')}
                        </DropdownMenuItem>
                        {announcement.status === 'queued' ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={!canSend || isScheduling}
                              onClick={() => onCancelSchedule(announcement.id)}
                            >
                              {t('cancel_schedule')}
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && announcements.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={7}
                >
                  {t('no_announcements')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {scheduleTarget && schedulingTimezone ? (
        <AnnouncementScheduleDialog
          announcementTitle={scheduleTarget.title}
          isOpen={Boolean(scheduleTarget)}
          isSubmitting={isScheduling}
          onClose={() => setScheduleTarget(null)}
          onConfirm={(scheduledSendAt) => {
            onSchedule(scheduleTarget.id, scheduledSendAt);
            setScheduleTarget(null);
          }}
          timezone={schedulingTimezone}
        />
      ) : null}
    </>
  );
}
