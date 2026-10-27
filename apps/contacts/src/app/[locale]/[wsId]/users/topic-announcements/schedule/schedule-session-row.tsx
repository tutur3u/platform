'use client';

import { FileText, Lock } from '@tuturuuu/icons';
import type {
  TopicScheduleClass,
  TopicScheduleGvnnContact,
  TopicScheduleRowError,
} from '@tuturuuu/internal-api/topic-announcements';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { scheduleMonthRange } from '@tuturuuu/utils/topic-schedule';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  type DraftIssue,
  type DraftSession,
  draftEndTime,
  draftGvcnId,
  isDraftRowChanged,
} from './schedule-draft';
import { ScheduleGvcnCell } from './schedule-gvcn-cell';
import { SCHEDULE_GRID_COLUMNS, scheduleRowDomId } from './schedule-layout';
import { ScheduleRowActions } from './schedule-row-actions';

const NO_GVNN = '__none__';

interface Props {
  classById: ReadonlyMap<string, TopicScheduleClass>;
  classes: readonly TopicScheduleClass[];
  contacts: readonly TopicScheduleGvnnContact[];
  highlighted: boolean;
  issues: readonly DraftIssue[];
  month: string;
  onDuplicate: (row: DraftSession, days: number) => void;
  onRemove: (key: string) => void;
  onUpdate: (key: string, patch: Partial<DraftSession>) => void;
  original: DraftSession | undefined;
  row: DraftSession;
  serverErrors: readonly TopicScheduleRowError['code'][];
}

export function ScheduleSessionRow({
  classById,
  classes,
  contacts,
  highlighted,
  issues,
  month,
  onDuplicate,
  onRemove,
  onUpdate,
  original,
  row,
  serverErrors,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const range = scheduleMonthRange(month);
  const set = (patch: Partial<DraftSession>) => onUpdate(row.key, patch);
  const endTime = draftEndTime(row);
  const changed = isDraftRowChanged(row, original);
  const disabled = row.locked;

  const classOptions = useMemo(
    () => classes.map((item) => ({ label: item.name, value: item.id })),
    [classes]
  );
  const gvnnOptions = useMemo(
    () => [
      { label: t('schedule_gvnn_none'), muted: true, value: NO_GVNN },
      ...contacts
        .filter((contact) => contact.isGvnn || contact.id === row.gvnnContactId)
        .map((contact) => ({
          label: contact.name,
          searchValue: `${contact.name} ${contact.email}`,
          value: contact.id,
        })),
    ],
    [contacts, row.gvnnContactId, t]
  );
  const messages = [
    ...issues.map((issue) => t(`schedule_issue_${issue}`)),
    ...serverErrors.map((code) => t(`schedule_server_${code}`)),
  ];

  return (
    <div
      className={cn(
        'border-b border-l-2 px-3 py-1.5 last:border-b-0',
        !original
          ? 'border-l-dynamic-blue'
          : changed
            ? 'border-l-dynamic-orange'
            : 'border-l-transparent',
        highlighted &&
          'bg-dynamic-blue/5 ring-1 ring-dynamic-blue/40 ring-inset',
        disabled && 'opacity-70'
      )}
      id={scheduleRowDomId(row.key)}
    >
      <div className={SCHEDULE_GRID_COLUMNS}>
        <Input
          aria-label={t('schedule_column_date')}
          className="h-8 px-2 text-sm"
          disabled={disabled}
          max={range.end}
          min={range.start}
          onChange={(event) => set({ sessionDate: event.target.value })}
          type="date"
          value={row.sessionDate}
        />
        <div>
          <Input
            aria-label={t('schedule_column_start')}
            className="h-8 px-2 text-sm tabular-nums"
            disabled={disabled}
            onChange={(event) => set({ startTime: event.target.value })}
            step={300}
            type="time"
            value={row.startTime}
          />
        </div>
        <div className="space-y-0.5">
          <Input
            aria-label={t('schedule_column_minutes')}
            className="h-8 px-2 text-sm tabular-nums"
            disabled={disabled}
            inputMode="numeric"
            max={240}
            min={5}
            onChange={(event) =>
              set({
                durationMinutes: Number.parseInt(event.target.value, 10) || 0,
              })
            }
            step={5}
            type="number"
            value={row.durationMinutes || ''}
          />
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {endTime ? t('schedule_ends_at', { time: endTime }) : '--'}
          </p>
        </div>
        <Combobox
          ariaLabel={t('schedule_column_class')}
          className="h-8 w-full"
          disabled={disabled}
          emptyText={t('schedule_class_empty')}
          onChange={(value) => set({ groupId: (value as string) || null })}
          options={classOptions}
          placeholder={t('schedule_class_placeholder')}
          searchPlaceholder={t('schedule_class_search')}
          selected={row.groupId ?? ''}
        />
        <ScheduleGvcnCell
          scheduleClass={row.groupId ? classById.get(row.groupId) : undefined}
          teacherId={draftGvcnId(row, original, classById)}
        />
        <Combobox
          ariaLabel={t('schedule_column_gvnn')}
          className={cn(
            'h-8 w-full',
            !row.gvnnContactId && 'border-dynamic-orange/50 text-dynamic-orange'
          )}
          disabled={disabled}
          emptyText={t('schedule_gvnn_empty')}
          onChange={(value) =>
            set({
              gvnnContactId:
                value === NO_GVNN ? null : (value as string) || null,
            })
          }
          options={gvnnOptions}
          placeholder={t('schedule_needs_gvnn')}
          searchPlaceholder={t('schedule_gvnn_search')}
          selected={row.gvnnContactId ?? ''}
        />
        <Input
          aria-label={t('schedule_column_room')}
          className="h-8 px-2 text-sm"
          disabled={disabled}
          maxLength={500}
          onChange={(event) => set({ room: event.target.value })}
          value={row.room}
        />
        <Input
          aria-label={t('schedule_column_campus')}
          className="h-8 px-2 text-sm"
          disabled={disabled}
          maxLength={500}
          onChange={(event) => set({ place: event.target.value })}
          value={row.place}
        />
        <div className="flex items-center justify-end gap-0.5">
          {row.locked ? (
            <Lock
              aria-label={t('schedule_locked')}
              className="h-4 w-4 text-muted-foreground"
            />
          ) : row.hasTopic ? (
            <FileText
              aria-label={t('schedule_has_topic')}
              className="h-4 w-4 text-dynamic-green"
            />
          ) : null}
          {disabled ? null : (
            <ScheduleRowActions
              hasTopic={row.hasTopic}
              onDuplicate={(days) => onDuplicate(row, days)}
              onRemove={() => onRemove(row.key)}
            />
          )}
        </div>
      </div>
      {messages.length > 0 ? (
        <p className="mt-1 text-dynamic-red text-xs" role="alert">
          {messages.join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
