'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, Loader2, PenLine } from '@tuturuuu/icons';
import {
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
import { TEACHER_TOPICS_QUERY_KEY } from './use-teacher-topic-actions';

const EDITABLE_STATUSES = new Set(['draft', 'queued', 'failed', 'skipped']);

const STATE_STYLES: Record<TopicAnnouncementDeliveryState, string> = {
  late: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
  not_sent: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
  sent: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
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
  const topicsQuery = useQuery({
    queryFn: () =>
      listTopicAnnouncements(wsId, {
        page: 1,
        pageSize: 100,
        status: 'active',
      }),
    queryKey: [TEACHER_TOPICS_QUERY_KEY, wsId],
  });
  const topics = topicsQuery.data?.data ?? [];

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
            const dueAt = formatDateTime(topic.send_due_at);
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
