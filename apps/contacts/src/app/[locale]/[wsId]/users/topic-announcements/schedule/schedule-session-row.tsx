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
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  type DraftIssue,
  type DraftSession,
  draftEndTime,
  draftGvcnId,
  isDraftRowChanged,
} from './schedule-draft';
import { ScheduleGvcnCell } from './schedule-gvcn-cell';
import { SCHEDULE_GRID_COLUMNS, scheduleRowDomId } from './schedule-layout';
import { ScheduleMoveDateDialog } from './schedule-move-date-dialog';
import { ScheduleRowActions } from './schedule-row-actions';

const NO_GVNN = '__none__';
const START_ISSUES = new Set<DraftIssue>([
  'duplicate_slot',
  'ends_after_midnight',
  'invalid_time',
]);

interface Props {
  classById: ReadonlyMap<string, TopicScheduleClass>;
  classes: readonly TopicScheduleClass[];
  contacts: readonly TopicScheduleGvnnContact[];
  highlighted: boolean;
  /** Blocking problems, already limited to touched rows or a save attempt. */
  issues: readonly DraftIssue[];
  month: string;
  onDuplicate: (row: DraftSession, days: number) => void;
  onRemove: (key: string) => void;
  onUpdate: (key: string, patch: Partial<DraftSession>) => void;
  original: DraftSession | undefined;
  row: DraftSession;
  serverErrors: readonly TopicScheduleRowError['code'][];
}

function lockedLabelKey(status: string) {
  if (status === 'queued') return 'schedule_locked_queued' as const;
  if (status === 'processing') return 'schedule_locked_sending' as const;
  return 'schedule_locked_sent' as const;
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
  const [moving, setMoving] = useState(false);
  const set = (patch: Partial<DraftSession>) => onUpdate(row.key, patch);
  const endTime = draftEndTime(row);
  const changed = isDraftRowChanged(row, original);
  const disabled = row.locked;
  const messageId = `${scheduleRowDomId(row.key)}-issues`;
  const messages = [
    ...issues.map((issue) => t(`schedule_issue_${issue}`)),
    ...serverErrors.map((code) => t(`schedule_server_${code}`)),
  ];
  const invalid = (field: 'minutes' | 'start') =>
    field === 'start'
      ? issues.some((issue) => START_ISSUES.has(issue)) ||
        serverErrors.includes('duplicate_slot')
      : issues.includes('invalid_duration');
  const describe = (field: 'minutes' | 'start') =>
    invalid(field)
      ? { 'aria-describedby': messageId, 'aria-invalid': true }
      : {};

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
          aria-label={t('schedule_column_start')}
          className="h-8 px-2 text-sm tabular-nums"
          disabled={disabled}
          onChange={(event) => set({ startTime: event.target.value })}
          step={300}
          type="time"
          value={row.startTime}
          {...describe('start')}
        />
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
            {...describe('minutes')}
          />
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {endTime ? t('schedule_ends_at', { time: endTime }) : '--'}
          </p>
        </div>
        <Combobox
          ariaLabel={t('schedule_column_class')}
          className={cn(
            'h-8 w-full',
            issues.includes('missing_class') && 'border-dynamic-red/60'
          )}
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
            !row.gvnnContactId && 'border-dynamic-orange/50'
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
            <span className="flex items-center gap-1 text-muted-foreground text-xs">
              <Lock aria-hidden className="h-3.5 w-3.5" />
              {t(lockedLabelKey(row.status))}
            </span>
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
              onMove={() => setMoving(true)}
              onRemove={() => onRemove(row.key)}
            />
          )}
        </div>
      </div>
      {messages.length > 0 ? (
        <p className="mt-1 text-dynamic-red text-xs" id={messageId}>
          {messages.join(' · ')}
        </p>
      ) : null}
      {moving ? (
        <ScheduleMoveDateDialog
          date={row.sessionDate}
          month={month}
          onClose={() => setMoving(false)}
          onMove={(sessionDate) => {
            set({ sessionDate });
            setMoving(false);
          }}
        />
      ) : null}
    </div>
  );
}
