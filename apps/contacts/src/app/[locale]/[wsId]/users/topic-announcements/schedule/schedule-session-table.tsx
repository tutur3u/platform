'use client';

import { CalendarDays, Plus } from '@tuturuuu/icons';
import type {
  TopicScheduleClass,
  TopicScheduleGvnnContact,
  TopicScheduleRowError,
} from '@tuturuuu/internal-api/topic-announcements';
import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { TopicAnnouncementsEmptyState } from '../topic-announcements-empty-state';
import type { DraftIssue, DraftSession } from './schedule-draft';
import { formatScheduleDay } from './schedule-format';
import { SCHEDULE_GRID_COLUMNS } from './schedule-layout';
import { ScheduleSessionRow } from './schedule-session-row';

interface Props {
  classById: ReadonlyMap<string, TopicScheduleClass>;
  classes: readonly TopicScheduleClass[];
  contacts: readonly TopicScheduleGvnnContact[];
  highlightKey: string | null;
  issues: ReadonlyMap<string, DraftIssue[]>;
  month: string;
  onAdd: (date: string) => void;
  onDuplicate: (row: DraftSession, days: number) => void;
  onRemove: (key: string) => void;
  onUpdate: (key: string, patch: Partial<DraftSession>) => void;
  originalByKey: ReadonlyMap<string, DraftSession>;
  rows: readonly DraftSession[];
  serverErrors: ReadonlyMap<string, TopicScheduleRowError['code'][]>;
}

export function ScheduleSessionTable(props: Props) {
  const { month, onAdd, rows } = props;
  const t = useTranslations('ws-topic-announcements');
  const locale = useLocale();

  const groups = useMemo(() => {
    const byDate = new Map<string, DraftSession[]>();
    for (const row of rows) {
      byDate.set(row.sessionDate, [
        ...(byDate.get(row.sessionDate) ?? []),
        row,
      ]);
    }
    return [...byDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, items]) => ({
        date,
        items: [...items].sort((left, right) =>
          left.startTime.localeCompare(right.startTime)
        ),
      }));
  }, [rows]);

  if (groups.length === 0) {
    return (
      <TopicAnnouncementsEmptyState
        action={
          <Button
            className="gap-2"
            onClick={() => onAdd(`${month}-01`)}
            size="sm"
          >
            <Plus className="h-4 w-4" />
            {t('schedule_add_session')}
          </Button>
        }
        description={t('schedule_empty_description')}
        icon={<CalendarDays />}
        title={t('schedule_empty_title')}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="min-w-[60rem]">
        <div
          className={`${SCHEDULE_GRID_COLUMNS} border-b bg-muted/40 px-3 py-2 font-medium text-muted-foreground text-xs`}
        >
          <span>{t('schedule_column_date')}</span>
          <span>{t('schedule_column_start')}</span>
          <span>{t('schedule_column_minutes')}</span>
          <span>{t('schedule_column_class')}</span>
          <span>{t('schedule_column_gvcn')}</span>
          <span>{t('schedule_column_gvnn')}</span>
          <span>{t('schedule_column_room')}</span>
          <span>{t('schedule_column_campus')}</span>
          <span className="sr-only">{t('schedule_column_actions')}</span>
        </div>
        {groups.map((group) => (
          <section
            aria-label={group.date}
            id={`schedule-day-${group.date}`}
            key={group.date}
          >
            <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-1.5">
              <span className="font-semibold text-sm">
                <span className="capitalize">
                  {formatScheduleDay(group.date, locale)}
                </span>
                <span className="ml-2 font-normal text-muted-foreground text-xs">
                  {t('schedule_session_count', { count: group.items.length })}
                </span>
              </span>
              <Button
                aria-label={t('schedule_add_on_day', { date: group.date })}
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => onAdd(group.date)}
                size="sm"
                variant="ghost"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('schedule_add_short')}
              </Button>
            </div>
            {group.items.map((row) => (
              <ScheduleSessionRow
                classById={props.classById}
                classes={props.classes}
                contacts={props.contacts}
                highlighted={props.highlightKey === row.key}
                issues={props.issues.get(row.key) ?? []}
                key={row.key}
                month={month}
                onDuplicate={props.onDuplicate}
                onRemove={props.onRemove}
                onUpdate={props.onUpdate}
                original={props.originalByKey.get(row.key)}
                row={row}
                serverErrors={props.serverErrors.get(row.key) ?? []}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
