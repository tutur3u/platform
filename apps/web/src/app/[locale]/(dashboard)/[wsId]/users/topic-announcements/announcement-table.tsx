'use client';

import { CalendarClock, MoreHorizontal, Send, Trash2 } from '@tuturuuu/icons';
import type { TopicAnnouncementRecord } from '@tuturuuu/internal-api';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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

function canRemoveAnnouncement(announcement: TopicAnnouncementRecord) {
  return ['draft', 'queued', 'failed', 'skipped'].includes(announcement.status);
}

function formatTimeValue(value: string | null) {
  if (!value) return null;

  const [hours, minutes] = value.split(':');
  if (!hours || !minutes) return value;

  return `${hours.padStart(2, '0')}:${minutes}`;
}

function formatTimeRange(announcement: TopicAnnouncementRecord) {
  const startTime = formatTimeValue(announcement.start_time);
  const endTime = formatTimeValue(announcement.end_time);

  if (startTime && endTime) return `${startTime} - ${endTime}`;
  return startTime ?? endTime;
}

function formatSessionDate(value: string | null) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    weekday: 'short',
  }).format(date);
}

function getDayLabel(announcement: TopicAnnouncementRecord) {
  return announcement.day_label || formatSessionDate(announcement.session_date);
}

function getClassLabel(announcement: TopicAnnouncementRecord) {
  return announcement.class_label || announcement.group?.name || null;
}

function getTeacherLabel(announcement: TopicAnnouncementRecord) {
  return announcement.contacts
    .map((contact) => contact.name.trim())
    .filter(Boolean)
    .join(', ');
}

function getRowClassName(status: TopicAnnouncementRecord['status']) {
  if (status === 'queued') return 'bg-dynamic-blue/5';
  if (status === 'sent') return 'bg-dynamic-green/5';
  if (status === 'failed') return 'bg-dynamic-red/5';
  if (status === 'skipped') return 'bg-dynamic-orange/5';
  if (status === 'cancelled') return 'bg-muted/60 text-muted-foreground';
  return 'bg-background';
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
  firstRowNumber: number;
  isDeleting: boolean;
  isLoading: boolean;
  isScheduling: boolean;
  isSending: boolean;
  onCancelSchedule: (announcementId: string) => void;
  onDelete: (announcementId: string) => void;
  onSchedule: (announcementId: string, scheduledSendAt: string) => void;
  onSend: (announcementId: string) => void;
  schedulingTimezone: string | null;
  onTimezoneRequired: () => void;
}

const tableHeadClassName =
  'h-9 border-border/80 border-r bg-dynamic-blue/15 px-2 font-semibold text-foreground text-xs uppercase';
const tableCellClassName = 'border-border/70 border-r px-2 py-1.5 align-top';

export function AnnouncementTable({
  announcements,
  canSend,
  firstRowNumber,
  isDeleting,
  isLoading,
  isScheduling,
  isSending,
  onCancelSchedule,
  onDelete,
  onSchedule,
  onSend,
  schedulingTimezone,
  onTimezoneRequired,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [removeTarget, setRemoveTarget] =
    useState<TopicAnnouncementRecord | null>(null);
  const [scheduleTarget, setScheduleTarget] =
    useState<TopicAnnouncementRecord | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-md border bg-background">
        <Table className="min-w-[78rem] text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(tableHeadClassName, 'w-14 text-right')}>
                {t('legacy_ord')}
              </TableHead>
              <TableHead className={cn(tableHeadClassName, 'w-32')}>
                {t('legacy_day')}
              </TableHead>
              <TableHead className={cn(tableHeadClassName, 'w-52')}>
                {t('legacy_class')}
              </TableHead>
              <TableHead className={cn(tableHeadClassName, 'w-20')}>
                {t('room')}
              </TableHead>
              <TableHead className={cn(tableHeadClassName, 'w-36')}>
                {t('startTime')}
              </TableHead>
              <TableHead className={cn(tableHeadClassName, 'w-44')}>
                {t('legacy_teacher')}
              </TableHead>
              <TableHead className={cn(tableHeadClassName, 'w-36')}>
                {t('place')}
              </TableHead>
              <TableHead className={cn(tableHeadClassName, 'min-w-72')}>
                {t('topic')}
              </TableHead>
              <TableHead className={cn(tableHeadClassName, 'w-28')}>
                {t('status')}
              </TableHead>
              <TableHead className={cn(tableHeadClassName, 'w-20 text-right')}>
                {t('actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 6 }, (_, index) => (
                  <TableRow key={`announcement-loading-${index}`}>
                    {Array.from({ length: 10 }, (_, cellIndex) => (
                      <TableCell
                        className={tableCellClassName}
                        key={`announcement-loading-${index}-${cellIndex}`}
                      >
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
            {announcements.map((announcement, index) => {
              const unverifiedCount = countUnverifiedRecipients(announcement);
              const sendReady = canSendAnnouncement(announcement);
              const scheduledLabel = formatTopicAnnouncementInstant(
                announcement.scheduled_send_at,
                schedulingTimezone ?? 'UTC'
              );
              const removable = canRemoveAnnouncement(announcement);
              const teacherLabel = getTeacherLabel(announcement);

              return (
                <TableRow
                  className={cn(
                    'border-border/70 hover:bg-muted/50',
                    getRowClassName(announcement.status)
                  )}
                  key={announcement.id}
                >
                  <TableCell
                    className={cn(
                      tableCellClassName,
                      'text-right font-mono text-muted-foreground text-xs'
                    )}
                  >
                    {firstRowNumber + index}
                  </TableCell>
                  <TableCell className={tableCellClassName}>
                    {getDayLabel(announcement) ?? t('none')}
                  </TableCell>
                  <TableCell className={cn(tableCellClassName, 'font-medium')}>
                    {getClassLabel(announcement) ?? t('none')}
                  </TableCell>
                  <TableCell className={tableCellClassName}>
                    {announcement.room || t('none')}
                  </TableCell>
                  <TableCell className={tableCellClassName}>
                    <div>{formatTimeRange(announcement) ?? t('none')}</div>
                    {announcement.status === 'queued' && scheduledLabel ? (
                      <div className="mt-1 flex items-center gap-1 text-dynamic-blue text-xs">
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span>{scheduledLabel}</span>
                      </div>
                    ) : announcement.sent_at ? (
                      <div className="mt-1 text-muted-foreground text-xs">
                        {formatTopicAnnouncementInstant(
                          announcement.sent_at,
                          schedulingTimezone ?? 'UTC'
                        )}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className={tableCellClassName}>
                    <div className="line-clamp-2">
                      {teacherLabel || t('none')}
                    </div>
                    {unverifiedCount > 0 ? (
                      <p className="mt-1 text-dynamic-orange text-xs">
                        {t('unverified_recipients', {
                          count: unverifiedCount.toString(),
                        })}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className={tableCellClassName}>
                    {announcement.place || t('none')}
                  </TableCell>
                  <TableCell className={tableCellClassName}>
                    <div className="font-medium">{announcement.title}</div>
                    <div className="line-clamp-2 text-muted-foreground text-xs">
                      {announcement.topic}
                    </div>
                  </TableCell>
                  <TableCell className={tableCellClassName}>
                    <Badge
                      variant={
                        announcement.status === 'sent' ? 'success' : 'outline'
                      }
                    >
                      {t(STATUS_LABEL_KEYS[announcement.status])}
                    </Badge>
                  </TableCell>
                  <TableCell className={cn(tableCellClassName, 'text-right')}>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={t('announcement_actions')}
                          size="icon"
                          variant="outline"
                        >
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
                        {removable ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={isDeleting}
                              onClick={() => setRemoveTarget(announcement)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('remove_announcement')}
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
                  colSpan={10}
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

      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => isDeleting && event.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('remove_announcement_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('remove_announcement_description', {
                title: removeTarget?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('cancel')}
            </AlertDialogCancel>
            <Button
              disabled={isDeleting || !removeTarget}
              onClick={() => {
                if (!removeTarget) return;
                onDelete(removeTarget.id);
                setRemoveTarget(null);
              }}
              variant="destructive"
            >
              {t('remove_announcement')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
