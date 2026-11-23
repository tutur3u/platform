'use client';

import type { MeetingRecordTask } from '@tuturuuu/internal-api/meet-record';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { LoadingRegion, SkeletonLine } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ActionItemsSheet } from './action-items-sheet';
import { RecordItemList } from './record-item-list';
import { taskHref, useMeetingRecord } from './use-meeting-record';

export type MeetingRecordLinks = {
  wsId: string;
  meetingId: string;
  workspaceSlug: string;
  tasksUrl: string;
  /** Meeting URL appended to each saved task. */
  sourceUrl: string;
};

/** The persistent meeting record: agenda, decisions and action items. */
export function MeetingRecordPanel(props: MeetingRecordLinks) {
  const { wsId, meetingId } = props;
  const t = useTranslations('meet.record');
  const record = useMeetingRecord(wsId, meetingId);
  const [reviewing, setReviewing] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {record.isPending ? (
          <LoadingRegion className="space-y-2" srLabel={t('loading')}>
            <SkeletonLine barClassName="w-2/3" size="sm" />
            <SkeletonLine barClassName="w-1/2" size="sm" />
          </LoadingRegion>
        ) : record.isError ? (
          <p className="text-muted-foreground text-sm">{t('unavailable')}</p>
        ) : (
          <>
            <section className="space-y-2">
              <h3 className="font-medium text-sm">{t('agenda')}</h3>
              <RecordItemList
                canEdit={record.data.canEdit}
                items={record.data.items.filter((i) => i.kind === 'agenda')}
                kind="agenda"
                meetingId={meetingId}
                wsId={wsId}
              />
            </section>
            <section className="space-y-2">
              <h3 className="font-medium text-sm">{t('decisions')}</h3>
              <RecordItemList
                canEdit={record.data.canEdit}
                items={record.data.items.filter((i) => i.kind === 'decision')}
                kind="decision"
                meetingId={meetingId}
                wsId={wsId}
              />
            </section>
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-sm">{t('action_items')}</h3>
                {record.data.canEdit ? (
                  <Button
                    onClick={() => setReviewing(true)}
                    size="sm"
                    variant="secondary"
                  >
                    {t('review_actions')}
                  </Button>
                ) : null}
              </div>
              <RecordTasks {...props} tasks={record.data.tasks} />
            </section>
          </>
        )}
      </CardContent>
      {reviewing ? (
        <ActionItemsSheet
          {...props}
          onClose={() => setReviewing(false)}
          suggestions={[]}
        />
      ) : null}
    </Card>
  );
}

function RecordTasks({
  tasks,
  tasksUrl,
  workspaceSlug,
}: MeetingRecordLinks & { tasks: MeetingRecordTask[] }) {
  const t = useTranslations('meet.record');
  if (!tasks.length)
    return <p className="text-muted-foreground text-sm">{t('empty_tasks')}</p>;
  return (
    <ul className="divide-y rounded-md border">
      {tasks.map((task) => (
        <li key={task.id} className="flex flex-wrap items-center gap-2 p-2">
          <Badge variant={task.done ? 'success' : 'outline'}>
            {t(task.done ? 'done' : 'open')}
          </Badge>
          <a
            className="min-w-0 flex-1 truncate text-sm hover:underline"
            href={taskHref(tasksUrl, workspaceSlug, task.id)}
          >
            {task.name}
          </a>
          {task.linkKind === 'carried_over' ? (
            <Badge variant="secondary">{t('carried_over')}</Badge>
          ) : null}
          <span className="text-muted-foreground text-xs">
            {[
              task.assignees
                .map((a) => a.displayName)
                .filter(Boolean)
                .join(', '),
              task.boardName,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  );
}
