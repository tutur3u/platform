'use client';

import {
  CalendarClock,
  CopyPlus,
  Eye,
  MoreHorizontal,
  Paperclip,
  Send,
  Trash2,
} from '@tuturuuu/icons';
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
import {
  AnnouncementRemoveDialog,
  AnnouncementSendPreviewDialog,
} from './announcement-table-dialogs';
import {
  ANNOUNCEMENT_STATUS_LABEL_KEYS,
  canRemoveAnnouncement,
  canSendAnnouncement,
  countUnverifiedRecipients,
  formatTimeRange,
  getClassLabel,
  getDayLabel,
  getRowClassName,
  getStatusBadgeVariant,
  getTeacherLabel,
  tableCellClassName,
  tableHeadClassName,
} from './announcement-table-utils';
import { formatTopicAnnouncementInstant } from './topic-announcements-scheduling';

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
  onFork: (announcement: TopicAnnouncementRecord) => void;
  onPreview: (announcement: TopicAnnouncementRecord) => void;
  onSchedule: (announcementId: string, scheduledSendAt: string) => void;
  onSend: (announcementId: string) => void;
  schedulingTimezone: string | null;
  onTimezoneRequired: () => void;
  wsId: string;
}

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
  onFork,
  onPreview,
  onSchedule,
  onSend,
  schedulingTimezone,
  onTimezoneRequired,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [removeTarget, setRemoveTarget] =
    useState<TopicAnnouncementRecord | null>(null);
  const [scheduleTarget, setScheduleTarget] =
    useState<TopicAnnouncementRecord | null>(null);
  const [sendPreviewTarget, setSendPreviewTarget] =
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
                    {announcement.attachments.length > 0 ? (
                      <div className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
                        <Paperclip className="h-3.5 w-3.5" />
                        <span>
                          {t('attachments_count', {
                            count: announcement.attachments.length.toString(),
                          })}
                        </span>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className={tableCellClassName}>
                    <Badge variant={getStatusBadgeVariant(announcement.status)}>
                      {t(ANNOUNCEMENT_STATUS_LABEL_KEYS[announcement.status])}
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
                          onClick={() => onPreview(announcement)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {t('preview_announcement')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onFork(announcement)}>
                          <CopyPlus className="mr-2 h-4 w-4" />
                          {t('fork_announcement')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={
                            !canSend ||
                            isSending ||
                            announcement.status === 'sent' ||
                            !sendReady
                          }
                          onClick={() => setSendPreviewTarget(announcement)}
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

      <AnnouncementSendPreviewDialog
        isSending={isSending}
        onOpenChange={(open) => {
          if (!open) setSendPreviewTarget(null);
        }}
        onSend={onSend}
        target={sendPreviewTarget}
        wsId={wsId}
      />

      <AnnouncementRemoveDialog
        isDeleting={isDeleting}
        onDelete={onDelete}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        target={removeTarget}
      />
    </>
  );
}
