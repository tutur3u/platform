'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, Loader2, PenLine } from '@tuturuuu/icons';
import {
  getWorkspaceCalendarSettings,
  listTopicAnnouncements,
  type TopicAnnouncementRecord,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import {
  getTopicAnnouncementDeliveryState,
  type TopicAnnouncementDeliveryState,
} from '@tuturuuu/utils/topic-announcement-deadline';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TeacherTopicDialog } from './teacher-topic-dialog';
import { isSchedulingTimezoneReady } from './topic-announcements-scheduling';
import { TEACHER_TOPICS_QUERY_KEY } from './use-teacher-topic-actions';

const EDITABLE_STATUSES = new Set(['draft', 'queued', 'failed', 'skipped']);

const STATE_STYLES: Record<TopicAnnouncementDeliveryState, string> = {
  late: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
  not_sent: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
  sent: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
};

const TEACHER_TOPICS_PAGE_SIZE = 50;

/** Formats the deadline in the workspace timezone (browser zone fallback). */
export function formatTeacherDeadline(
  value: string | null | undefined,
  timeZone: string | null
) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  });
  if (!timeZone) return formatted;
  // dateStyle cannot be combined with timeZoneName, so add the zone label.
  const zone = new Intl.DateTimeFormat(undefined, {
    timeZone,
    timeZoneName: 'short',
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  return zone ? `${formatted} ${zone}` : formatted;
}

/**
 * Assignment-scoped teacher view. The server only returns topics assigned to
 * the teacher or their classes, so no client-side filtering is needed.
 */
export function TeacherTopicsView({
  canSend,
  wsId,
}: {
  canSend: boolean;
  wsId: string;
}) {
  const t = useTranslations('ws-topic-announcements');
  const [editing, setEditing] = useState<TopicAnnouncementRecord | null>(null);
  const [page, setPage] = useState(1);
  const topicsQuery = useQuery({
    queryFn: () =>
      listTopicAnnouncements(wsId, {
        page,
        pageSize: TEACHER_TOPICS_PAGE_SIZE,
        status: 'active',
      }),
    queryKey: [TEACHER_TOPICS_QUERY_KEY, wsId, page],
  });
  const settingsQuery = useQuery({
    queryFn: () => getWorkspaceCalendarSettings(wsId),
    queryKey: ['topic-announcement-calendar-settings', wsId],
    retry: false,
  });
  const timeZone = isSchedulingTimezoneReady(settingsQuery.data?.timezone)
    ? (settingsQuery.data?.timezone ?? null)
    : null;
  const topics = topicsQuery.data?.data ?? [];
  const totalPages = topicsQuery.data?.totalPages ?? 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {t('teacher_topics_title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('teacher_topics_description')}
          </p>
        </div>
      </div>

      {topicsQuery.isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : topics.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            {t('teacher_topics_empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {topics.map((topic) => {
            const state = getTopicAnnouncementDeliveryState({
              sendDueAt: topic.send_due_at,
              sentAt: topic.sent_at,
            });
            const dueAt = formatTeacherDeadline(topic.send_due_at, timeZone);
            const editable = EDITABLE_STATUSES.has(topic.status);

            return (
              <Card key={topic.id}>
                <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{topic.title}</span>
                      <Badge
                        className={cn('border', STATE_STYLES[state])}
                        variant="outline"
                      >
                        {t(`delivery_state_${state}`)}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {[
                        topic.group?.name ?? topic.class_label,
                        topic.session_date,
                        topic.start_time?.slice(0, 5),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {dueAt
                        ? t('teacher_deadline', { date: dueAt })
                        : t('teacher_no_deadline')}
                    </p>
                  </div>
                  <Button
                    className="gap-2"
                    disabled={!editable}
                    onClick={() => setEditing(topic)}
                    type="button"
                    variant={topic.topic ? 'outline' : 'default'}
                  >
                    <PenLine className="h-4 w-4" />
                    {topic.topic
                      ? t('teacher_edit_topic')
                      : t('teacher_write_topic')}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
            variant="outline"
          >
            {t('previous')}
          </Button>
          <span className="text-muted-foreground text-sm">
            {t('page_count', {
              page: page.toString(),
              total: totalPages.toString(),
            })}
          </span>
          <Button
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
            type="button"
            variant="outline"
          >
            {t('next')}
          </Button>
        </div>
      ) : null}

      {editing ? (
        <TeacherTopicDialog
          announcement={editing}
          canSend={canSend}
          onClose={() => setEditing(null)}
          wsId={wsId}
        />
      ) : null}
    </div>
  );
}
